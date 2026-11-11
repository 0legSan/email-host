import type { ImapFlow } from "imapflow"

import type { Id } from "../../../../convex/_generated/dataModel"
import type { MailAgentConvexClient } from "../convex/client"
import { createImapClient } from "../mail-engine"
import {
  ImapConnectionStartScheduler,
  isBegetImapHost,
} from "./imap-connection-start-scheduler"
import type { MailAccountRegistry } from "./mail-account-registry"
import { findMailAccountCredentials } from "./mail-account-credentials"

const idleRefreshIntervalMs = 25 * 60 * 1000
const reconnectInitialDelayMs = 1_000
const reconnectMaxDelayMs = 60_000
const stableConnectionMs = 60_000
const syncPageSize = 50

type SyncAccountInbox = (
  accountId: Id<"mailAccounts">,
  params: { pageSize: number; pageLimit: number }
) => Promise<unknown>

type ApplyMailboxProviderFlags = (
  accountId: Id<"mailAccounts">,
  mailboxPath: string,
  uid: number,
  flags: {
    seen: boolean
    flagged: boolean
    answered: boolean
    forwarded: boolean
    draft: boolean
  },
  modseq?: string
) => Promise<unknown>

type AccountWatchState = {
  accountId: Id<"mailAccounts">
  credentialVersion: number
  client: ImapFlow | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  cancelReconnect: (() => void) | null
  syncTimer: ReturnType<typeof setTimeout> | null
  syncRequested: boolean
  syncPromise: Promise<void> | null
  operationTail: Promise<void>
  clientReady: Promise<void>
  resolveClientReady: () => void
  stopping: boolean
  task: Promise<void>
}

export class MailIdleWatcher {
  private readonly convex: MailAgentConvexClient
  private readonly mailCredentialSecret: string
  private readonly accountRegistry: MailAccountRegistry
  private syncAccountInbox: SyncAccountInbox | null = null
  private applyMailboxProviderFlags: ApplyMailboxProviderFlags | null = null
  private readonly syncPageLimit: number
  private readonly connectionStartScheduler: ImapConnectionStartScheduler
  private readonly accounts = new Map<Id<"mailAccounts">, AccountWatchState>()
  private readonly persistentAccountIds = new Set<Id<"mailAccounts">>()
  private unsubscribeAccounts: (() => void) | null = null
  private refreshPromise: Promise<void> | null = null
  private refreshPending = false
  private readonly readySignal = createSignal()
  private running = false

  constructor(
    convex: MailAgentConvexClient,
    mailCredentialSecret: string,
    recentMessageCacheSize: number,
    connectionStartScheduler: ImapConnectionStartScheduler,
    accountRegistry: MailAccountRegistry
  ) {
    this.convex = convex
    this.mailCredentialSecret = mailCredentialSecret
    this.connectionStartScheduler = connectionStartScheduler
    this.accountRegistry = accountRegistry
    this.syncPageLimit = Math.max(
      1,
      Math.ceil(recentMessageCacheSize / syncPageSize)
    )
  }

  setSyncAccountInbox(syncAccountInbox: SyncAccountInbox) {
    this.syncAccountInbox = syncAccountInbox
  }

  setApplyMailboxProviderFlags(
    applyMailboxProviderFlags: ApplyMailboxProviderFlags
  ) {
    this.applyMailboxProviderFlags = applyMailboxProviderFlags
  }

  isRealtimeAccount(accountId: Id<"mailAccounts">) {
    const client = this.accounts.get(accountId)?.client
    return Boolean(client?.usable && client.capabilities.has("IDLE"))
  }

  supports(settings: { host: string }, accountId?: string) {
    return (
      !isBegetImapHost(settings.host) ||
      (accountId !== undefined &&
        this.persistentAccountIds.has(accountId as Id<"mailAccounts">))
    )
  }

  whenReady() {
    return this.readySignal.promise
  }

  async run<T>(
    accountId: string,
    operation: (client: ImapFlow) => Promise<T>
  ): Promise<T> {
    if (!this.running) {
      throw new Error("Mail IMAP sessions are not running")
    }

    await this.readySignal.promise

    const convexAccountId = accountId as Id<"mailAccounts">
    let state = this.accounts.get(convexAccountId)

    if (!state) {
      this.refresh()
      await this.refreshPromise
      state = this.accounts.get(convexAccountId)
    }

    if (!state || state.stopping) {
      throw new Error(
        `Mail IMAP session is unavailable for account ${accountId}`
      )
    }

    const result = state.operationTail.then(async () => {
      const client = await this.waitForClient(state)

      try {
        return await operation(client)
      } finally {
        if (
          client.usable &&
          client.mailbox &&
          (client.mailbox.path.toUpperCase() !== "INBOX" ||
            !client.mailbox.readOnly)
        ) {
          await client.mailboxOpen("INBOX", { readOnly: true })
        }
      }
    })

    state.operationTail = result.then(
      () => undefined,
      () => undefined
    )

    return result
  }

  start() {
    if (this.running) {
      return
    }

    this.running = true
    this.unsubscribeAccounts = this.accountRegistry.subscribe(() => {
      this.refresh()
    })
  }

  async stop() {
    if (!this.running) {
      return
    }

    this.running = false

    this.unsubscribeAccounts?.()
    this.unsubscribeAccounts = null
    this.readySignal.resolve()

    await this.refreshPromise
    await Promise.all(
      [...this.accounts.values()].map((state) => this.stopAccount(state))
    )
  }

  refresh() {
    if (!this.running) {
      return
    }

    if (this.refreshPromise) {
      this.refreshPending = true
      return
    }

    this.refreshPromise = this.reconcileAccounts()
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error("Mail IDLE account refresh failed", message)
      })
      .finally(() => {
        this.refreshPromise = null
        this.readySignal.resolve()

        if (this.refreshPending) {
          this.refreshPending = false
          this.refresh()
        }
      })
  }

  private async reconcileAccounts() {
    const availableAccounts = this.accountRegistry.getAccounts()

    if (!this.running) {
      return
    }

    const desiredById = new Map(
      availableAccounts.map((account) => [
        account.id,
        account.credentialVersion,
      ])
    )

    this.persistentAccountIds.clear()
    for (const accountId of desiredById.keys()) {
      this.persistentAccountIds.add(accountId)
    }

    await Promise.all(
      [...this.accounts.values()]
        .filter(
          (state) =>
            desiredById.get(state.accountId) !== state.credentialVersion
        )
        .map((state) => this.stopAccount(state))
    )

    if (!this.running) {
      return
    }

    for (const [accountId, credentialVersion] of desiredById) {
      if (!this.accounts.has(accountId)) {
        this.startAccount(accountId, credentialVersion)
      }
    }
  }

  private startAccount(
    accountId: Id<"mailAccounts">,
    credentialVersion: number
  ) {
    const clientReady = createSignal()
    const state: AccountWatchState = {
      accountId,
      credentialVersion,
      client: null,
      reconnectTimer: null,
      cancelReconnect: null,
      syncTimer: null,
      syncRequested: false,
      syncPromise: null,
      operationTail: Promise.resolve(),
      clientReady: clientReady.promise,
      resolveClientReady: clientReady.resolve,
      stopping: false,
      task: Promise.resolve(),
    }

    this.accounts.set(accountId, state)
    state.task = this.watchAccount(state)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error("Mail IDLE watcher failed", { accountId, message })
      })
      .finally(() => {
        if (this.accounts.get(accountId) === state) {
          this.accounts.delete(accountId)
        }
      })
  }

  private async stopAccount(state: AccountWatchState) {
    if (state.stopping) {
      await state.task
      return
    }

    state.stopping = true
    state.syncRequested = false

    if (state.syncTimer) {
      clearTimeout(state.syncTimer)
      state.syncTimer = null
    }

    state.cancelReconnect?.()
    state.resolveClientReady()
    state.client?.close()
    await state.task
    await state.syncPromise
    await state.operationTail
  }

  private async watchAccount(state: AccountWatchState) {
    let reconnectAttempt = 0

    while (this.running && !state.stopping) {
      const credentials = await findMailAccountCredentials(
        this.convex,
        state.accountId,
        this.mailCredentialSecret
      )

      if (!credentials) {
        return
      }

      const connectionStartDelayMs = this.connectionStartScheduler.reserveDelay(
        credentials.imap.host
      )

      if (connectionStartDelayMs > 0) {
        await this.waitForReconnect(state, connectionStartDelayMs)
      }

      if (!this.running || state.stopping) {
        return
      }

      const client = createImapClient(credentials.imap, {
        maxIdleTime: idleRefreshIntervalMs,
        missingIdleCommand: "STATUS",
        socketTimeout: 5 * 60 * 1000,
      })
      let connectedAt: number | null = null
      const connectionStartedAt = Date.now()
      let connected = false

      client.on("exists", ({ count, prevCount }) => {
        if (
          count !== prevCount &&
          client.mailbox &&
          client.mailbox.path.toUpperCase() === "INBOX"
        ) {
          this.queueSync(state)
        }
      })
      client.on("expunge", () => {
        this.queueSync(state)
      })
      client.on("flags", ({ path, uid, flags, modseq }) => {
        if (!uid || !this.applyMailboxProviderFlags) return
        void this.applyMailboxProviderFlags(
          state.accountId,
          path,
          uid,
          toMessageFlags(flags),
          modseq?.toString()
        ).catch((error) => {
          console.error("Mail IDLE flag update failed", {
            accountId: state.accountId,
            mailboxPath: path,
            uid,
            message: error instanceof Error ? error.message : String(error),
          })
        })
      })
      client.on("error", (error) => {
        if (!state.stopping) {
          console.error("Mail IDLE connection failed", {
            accountId: state.accountId,
            message: error.message,
          })
        }
      })

      try {
        await client.connect()
        connected = true
        this.connectionStartScheduler.recordConnectionSuccess(
          credentials.imap.host,
          Date.now() - connectionStartedAt
        )
        await client.mailboxOpen("INBOX", { readOnly: true })
        connectedAt = Date.now()
        state.client = client
        state.resolveClientReady()
        this.queueSync(state)
        await waitForClose(client)
      } catch (error) {
        if (!state.stopping) {
          if (!connected) {
            this.connectionStartScheduler.recordConnectionFailure(
              credentials.imap.host,
              Date.now() - connectionStartedAt,
              error
            )
          }
          const message = error instanceof Error ? error.message : String(error)
          console.error("Mail IDLE watch failed", {
            accountId: state.accountId,
            message,
          })
        }
      } finally {
        if (state.client === client) {
          state.client = null
          const clientReady = createSignal()
          state.clientReady = clientReady.promise
          state.resolveClientReady = clientReady.resolve
        }
        client.close()
      }

      if (!this.running || state.stopping) {
        return
      }

      if (connectedAt && Date.now() - connectedAt >= stableConnectionMs) {
        reconnectAttempt = 0
      }

      const reconnectDelayMs = Math.min(
        reconnectMaxDelayMs,
        reconnectInitialDelayMs * 2 ** Math.min(reconnectAttempt, 6)
      )
      reconnectAttempt += 1
      await this.waitForReconnect(state, reconnectDelayMs)
    }
  }

  private queueSync(state: AccountWatchState) {
    if (!this.running || state.stopping) {
      return
    }

    state.syncRequested = true

    if (state.syncPromise || state.syncTimer) {
      return
    }

    state.syncTimer = setTimeout(() => {
      state.syncTimer = null
      state.syncPromise = this.drainSyncRequests(state).finally(() => {
        state.syncPromise = null
      })
    }, 500)

    if (typeof state.syncTimer === "object" && "unref" in state.syncTimer) {
      state.syncTimer.unref()
    }
  }

  private async drainSyncRequests(state: AccountWatchState) {
    while (this.running && !state.stopping && state.syncRequested) {
      state.syncRequested = false

      try {
        await this.syncAccountInbox?.(state.accountId, {
          pageSize: syncPageSize,
          pageLimit: this.syncPageLimit,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error("Mail IDLE sync failed", {
          accountId: state.accountId,
          message,
        })
      }
    }
  }

  private async waitForClient(state: AccountWatchState) {
    while (this.running && !state.stopping) {
      if (state.client?.usable) {
        return state.client
      }

      await state.clientReady
    }

    throw new Error(`Mail IMAP session stopped for account ${state.accountId}`)
  }

  private waitForReconnect(state: AccountWatchState, delayMs: number) {
    return new Promise<void>((resolve) => {
      const finish = () => {
        if (state.reconnectTimer) {
          clearTimeout(state.reconnectTimer)
          state.reconnectTimer = null
        }
        state.cancelReconnect = null
        resolve()
      }

      state.cancelReconnect = finish
      state.reconnectTimer = setTimeout(finish, delayMs)

      if (
        typeof state.reconnectTimer === "object" &&
        "unref" in state.reconnectTimer
      ) {
        state.reconnectTimer.unref()
      }
    })
  }
}

function toMessageFlags(flags: Set<string>) {
  return {
    answered: hasFlag(flags, "\\Answered"),
    draft: hasFlag(flags, "\\Draft"),
    flagged: hasFlag(flags, "\\Flagged"),
    forwarded: hasFlag(flags, "$Forwarded"),
    seen: hasFlag(flags, "\\Seen"),
  }
}

function hasFlag(flags: Set<string>, flag: string) {
  const normalizedFlag = flag.toLowerCase()
  return [...flags].some((value) => value.toLowerCase() === normalizedFlag)
}

function createSignal() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((signalResolve) => {
    resolve = signalResolve
  })

  return { promise, resolve }
}

async function waitForClose(client: ImapFlow) {
  if (!client.usable) {
    return
  }

  await new Promise<void>((resolve) => {
    client.once("close", resolve)
  })
}
