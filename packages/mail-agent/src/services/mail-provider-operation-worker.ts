import { internal } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { MailAgentConvexClient } from "../convex/client"
import type { MailEngine } from "../mail-engine"
import { findMailAccountCredentials } from "./mail-account-credentials"
import { ReactiveWorkerScheduler } from "./reactive-worker-scheduler"

const maxAttempts = 8
const staleLockMs = 5 * 60 * 1000
const retryDelaysMs = [
  1_000, 5_000, 30_000, 120_000, 600_000, 1_800_000, 3_600_000,
]

type ClaimedOperation = {
  operation: {
    _id: Id<"mailProviderOperations">
    accountId: Id<"mailAccounts">
    operation: "update_flags" | "move" | "delete"
    desiredFlags?: { seen?: boolean; flagged?: boolean }
    version: number
    attempts: number
  }
  message: { flagsVersion: number } | null
  location: { uid?: string } | null
  mailbox: { path: string } | null
  destinationMailbox: { path: string } | null
}

export class MailProviderOperationWorker {
  private readonly convex: MailAgentConvexClient
  private readonly mailEngine: MailEngine
  private readonly mailCredentialSecret: string
  private readonly scheduler: ReactiveWorkerScheduler
  private unsubscribe: (() => void) | null = null

  constructor(
    convex: MailAgentConvexClient,
    mailEngine: MailEngine,
    mailCredentialSecret: string
  ) {
    this.convex = convex
    this.mailEngine = mailEngine
    this.mailCredentialSecret = mailCredentialSecret
    this.scheduler = new ReactiveWorkerScheduler(() => this.tick(), staleLockMs)
  }

  start() {
    if (this.unsubscribe) return
    this.unsubscribe = this.convex.subscribe(
      internal.mailInternal.getProviderOperationWakeState,
      {},
      (state) => this.scheduler.update(state),
      (error) => {
        console.error(
          "Mail provider operation subscription failed",
          error.message
        )
      }
    )
  }

  stop() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.scheduler.stop()
  }

  private async tick() {
    try {
      const operations = await this.claimOperations()
      const flagGroups = new Map<string, ClaimedOperation[]>()
      const individualOperations: ClaimedOperation[] = []

      for (const operation of operations) {
        if (
          operation.operation.operation !== "update_flags" ||
          !operation.message ||
          !operation.location?.uid ||
          !operation.mailbox ||
          operation.message.flagsVersion > operation.operation.version
        ) {
          individualOperations.push(operation)
          continue
        }

        const key = JSON.stringify([
          operation.operation.accountId,
          operation.mailbox.path,
          operation.operation.desiredFlags?.seen ?? null,
          operation.operation.desiredFlags?.flagged ?? null,
        ])
        const group = flagGroups.get(key) ?? []
        group.push(operation)
        flagGroups.set(key, group)
      }

      for (const group of flagGroups.values()) {
        await this.processFlagOperations(group)
      }
      for (const operation of individualOperations) {
        await this.processOperation(operation)
      }
    } catch (error) {
      console.error(
        "Mail provider operation worker failed",
        getErrorMessage(error)
      )
    }
  }

  private claimOperations() {
    return this.convex.mutation(internal.mailInternal.claimProviderOperations, {
      limit: 100,
      now: Date.now(),
    })
  }

  private async processFlagOperations(claimed: ClaimedOperation[]) {
    const first = claimed[0]
    if (!first?.mailbox) return

    try {
      const credentials = await findMailAccountCredentials(
        this.convex,
        first.operation.accountId,
        this.mailCredentialSecret
      )
      if (!credentials) {
        throw new Error("Mail account credentials are unavailable")
      }

      await this.mailEngine.updateMessageFlagsBatch(
        credentials,
        first.mailbox.path,
        claimed.flatMap((item) =>
          item.location?.uid ? [Number(item.location.uid)] : []
        ),
        first.operation.desiredFlags ?? {}
      )
      await this.finishMany(
        claimed.map((item) => ({
          operationId: item.operation._id,
          status: "succeeded" as const,
        }))
      )
    } catch (error) {
      await this.failOperations(claimed, error)
    }
  }

  private async processOperation(claimed: ClaimedOperation) {
    const { operation, message, location, mailbox, destinationMailbox } =
      claimed

    try {
      if (!message || !location?.uid || !mailbox) {
        throw new Error("Message provider location is unavailable")
      }
      if (message.flagsVersion > operation.version) {
        await this.finish(operation._id, "superseded")
        return
      }

      const credentials = await findMailAccountCredentials(
        this.convex,
        operation.accountId,
        this.mailCredentialSecret
      )
      if (!credentials) {
        throw new Error("Mail account credentials are unavailable")
      }

      if (operation.operation === "update_flags") {
        await this.mailEngine.updateMessageFlags(
          credentials,
          mailbox.path,
          Number(location.uid),
          operation.desiredFlags ?? {}
        )
      } else if (operation.operation === "move") {
        if (!destinationMailbox) {
          throw new Error("Destination mailbox is unavailable")
        }
        await this.mailEngine.moveMessage(
          credentials,
          mailbox.path,
          Number(location.uid),
          destinationMailbox.path
        )
      } else {
        await this.mailEngine.deleteMessage(
          credentials,
          mailbox.path,
          Number(location.uid)
        )
      }

      await this.finish(operation._id, "succeeded")
    } catch (error) {
      await this.failOperations([claimed], error)
    }
  }

  private async failOperations(claimed: ClaimedOperation[], error: unknown) {
    const now = Date.now()
    const message = getErrorMessage(error)
    await this.finishMany(
      claimed.map(({ operation }) => {
        const failed = operation.attempts >= maxAttempts
        const delayMs =
          retryDelaysMs[
            Math.min(operation.attempts - 1, retryDelaysMs.length - 1)
          ]

        return {
          operationId: operation._id,
          status: failed ? ("failed" as const) : ("retry" as const),
          nextAttemptAt: failed ? undefined : now + delayMs,
          lastError: message,
        }
      })
    )
    console.warn("Mail provider operation batch failed", {
      operationIds: claimed.map((item) => item.operation._id),
      error: message,
    })
  }

  private finishMany(
    updates: Array<{
      operationId: Id<"mailProviderOperations">
      status: "succeeded" | "retry" | "failed" | "superseded"
      nextAttemptAt?: number
      lastError?: string
    }>
  ) {
    return this.convex.mutation(
      internal.mailInternal.finishProviderOperations,
      { updates, now: Date.now() }
    )
  }

  private finish(
    operationId: Id<"mailProviderOperations">,
    status: "succeeded" | "superseded"
  ) {
    return this.convex.mutation(internal.mailInternal.finishProviderOperation, {
      operationId,
      status,
      now: Date.now(),
    })
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
