import type { Id } from "../../../../convex/_generated/dataModel"
import { getMailEngineErrorLogDetails, MailEngineError } from "../mail-engine"
import type { MailAccountRegistry } from "./mail-account-registry"
import type { MailReadService } from "./mail-read-service"

const syncPageSize = 50
const defaultFullSyncIntervalMs = 15 * 60 * 1000
const begetFullSyncIntervalMs = 30 * 60 * 1000
const maxInboxFailureBackoffMs = 15 * 60 * 1000
const backgroundWorkIntervalMs = 60 * 1000

type MailSyncWorkerOptions = {
  fallbackInboxPollIntervalSeconds?: number
  realtimeSafetyPollIntervalSeconds?: number
  isRealtimeAccount?: (accountId: Id<"mailAccounts">) => boolean
}

type SyncWorkerAccount = {
  id: Id<"mailAccounts">
  provider: string
}

export class MailSyncWorker {
  private readonly accountRegistry: MailAccountRegistry
  private readonly mail: MailReadService
  private readonly intervalMs: number
  private readonly fallbackInboxPollIntervalMs: number
  private readonly realtimeSafetyPollIntervalMs: number
  private readonly isRealtimeAccount: (accountId: Id<"mailAccounts">) => boolean
  private readonly recentMessageCacheSize: number
  private readonly fullSyncLastAttemptAt = new Map<Id<"mailAccounts">, number>()
  private readonly nextInboxCheckAt = new Map<Id<"mailAccounts">, number>()
  private readonly inboxFailureCount = new Map<Id<"mailAccounts">, number>()
  private backfillAccountIndex = 0
  private secondaryAccountIndex = 0
  private nextBackgroundWorkAt = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private started = false
  private running = false

  constructor(
    accountRegistry: MailAccountRegistry,
    mail: MailReadService,
    intervalSeconds: number,
    recentMessageCacheSize: number,
    options: MailSyncWorkerOptions = {}
  ) {
    this.accountRegistry = accountRegistry
    this.mail = mail
    this.intervalMs = Math.min(intervalSeconds * 1000, 30_000)
    this.fallbackInboxPollIntervalMs =
      (options.fallbackInboxPollIntervalSeconds ?? intervalSeconds) * 1000
    this.realtimeSafetyPollIntervalMs =
      (options.realtimeSafetyPollIntervalSeconds ?? 10 * 60) * 1000
    this.isRealtimeAccount = options.isRealtimeAccount ?? (() => false)
    this.recentMessageCacheSize = recentMessageCacheSize
  }

  start() {
    if (this.started) return
    this.started = true
    this.schedule(0)
  }

  stop() {
    this.started = false
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(delayMs: number) {
    if (!this.started) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.tick().finally(() => {
        this.schedule(this.intervalMs)
      })
    }, delayMs)
    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref()
    }
  }

  private async tick() {
    if (this.running) {
      return
    }

    this.running = true

    try {
      const accounts = this.accountRegistry.getAccounts().map((account) => ({
        id: account.id,
        provider: account.provider,
      }))

      await Promise.all(
        accounts.map((account) => this.syncInboxWhenDue(account))
      )
      const now = Date.now()
      if (now >= this.nextBackgroundWorkAt) {
        this.nextBackgroundWorkAt = now + backgroundWorkIntervalMs
        await this.syncNextSecondaryMailbox(accounts)
        await this.syncNextBackfill(accounts)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error("Mail sync worker failed", message)
    } finally {
      this.running = false
    }
  }

  private async syncInboxWhenDue(account: SyncWorkerAccount) {
    const now = Date.now()
    if ((this.nextInboxCheckAt.get(account.id) ?? 0) > now) {
      return
    }

    const syncParams = this.createSyncParams()
    const normalIntervalMs = this.isRealtimeAccount(account.id)
      ? this.realtimeSafetyPollIntervalMs
      : this.fallbackInboxPollIntervalMs

    try {
      await this.mail.syncAccountInboxById(account.id, syncParams)
      this.inboxFailureCount.delete(account.id)
      this.nextInboxCheckAt.set(account.id, Date.now() + normalIntervalMs)
    } catch (error) {
      const failures = (this.inboxFailureCount.get(account.id) ?? 0) + 1
      this.inboxFailureCount.set(account.id, failures)
      const retryDelayMs = Math.min(
        maxInboxFailureBackoffMs,
        normalIntervalMs * 2 ** Math.min(failures, 4)
      )
      this.nextInboxCheckAt.set(account.id, Date.now() + retryDelayMs)
      console.error("Mail inbox sync failed", {
        accountId: account.id,
        retryDelayMs,
        ...getSyncErrorLogDetails(error),
      })
    }
  }

  private async syncNextSecondaryMailbox(accounts: SyncWorkerAccount[]) {
    if (accounts.length === 0) return

    const account = accounts[this.secondaryAccountIndex % accounts.length]
    this.secondaryAccountIndex =
      (this.secondaryAccountIndex + 1) % accounts.length
    if (!account) return

    try {
      await this.mail.syncNextDueSecondaryMailboxById(account.id)
    } catch (error) {
      console.error("Mail secondary mailbox sync failed", {
        accountId: account.id,
        ...getSyncErrorLogDetails(error),
      })
    }
  }

  private async syncNextBackfill(accounts: SyncWorkerAccount[]) {
    if (accounts.length === 0) {
      return
    }

    const account = accounts[this.backfillAccountIndex % accounts.length]
    this.backfillAccountIndex =
      (this.backfillAccountIndex + 1) % accounts.length
    if (!account) return

    const syncParams = this.createSyncParams()
    const refreshMailboxes = this.shouldRunFullSync(account)

    try {
      if (refreshMailboxes) {
        await this.mail.refreshAccountMailboxesById(account.id)
      }
      const result = await this.mail.syncNextAccountBackfillById(
        account.id,
        syncParams
      )
      return result?.backfillPending ?? false
    } catch (error) {
      console.error("Mail full sync account failed", {
        accountId: account.id,
        ...getSyncErrorLogDetails(error),
      })
    }
  }

  private shouldRunFullSync(account: SyncWorkerAccount) {
    const now = Date.now()
    const previousAttemptAt = this.fullSyncLastAttemptAt.get(account.id)

    if (!previousAttemptAt) {
      this.fullSyncLastAttemptAt.set(account.id, now)
      return true
    }

    const intervalMs =
      account.provider === "beget"
        ? begetFullSyncIntervalMs
        : defaultFullSyncIntervalMs

    if (now - previousAttemptAt < intervalMs) {
      return false
    }

    this.fullSyncLastAttemptAt.set(account.id, now)
    return true
  }

  private createSyncParams() {
    return {
      pageSize: syncPageSize,
      pageLimit: Math.max(
        1,
        Math.ceil(this.recentMessageCacheSize / syncPageSize)
      ),
    }
  }
}

function getSyncErrorLogDetails(error: unknown) {
  if (error instanceof MailEngineError) {
    return getMailEngineErrorLogDetails(error)
  }

  return {
    message: error instanceof Error ? error.message : String(error),
  }
}
