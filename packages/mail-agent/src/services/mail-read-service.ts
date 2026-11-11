import { randomUUID } from "node:crypto"

import { internal } from "../../../../convex/_generated/api"
import type { Doc, Id } from "../../../../convex/_generated/dataModel"
import type {
  ListStoredMessagesResponse,
  LiveMailboxDto,
  LiveMessageDto,
  LiveMessageListItemDto,
  MailMessageThreadDto,
  UpdateMessageRequest,
} from "../contracts"
import type { MailAgentConvexClient } from "../convex/client"
import type {
  MailEngine,
  MailEngineAttachment,
  MailEngineMailboxStatus,
  MailEngineMessageMetadata,
  MailEngineParsedMessage,
  FetchMessageMetadataBatchResult,
} from "../mail-engine"
import type { ImapConnectionStartScheduler } from "./imap-connection-start-scheduler"
import { findMailAccountCredentials } from "./mail-account-credentials"

const mailboxOrder = new Map([
  ["\\Inbox", 0],
  ["\\Sent", 1],
  ["\\Drafts", 2],
  ["\\Junk", 3],
  ["\\Trash", 4],
])
const mailboxSyncRetryDelaysMs = [1_000, 3_000, 8_000] as const
const backfillBatchSize = 100
const bodyWarmBatchSize = 50
const ingestionBatchSize = 25
const uidInspectionBatchSize = 50
const reconciliationBatchSize = 25
const frequentlyChangingMailboxIntervalMs = 5 * 60 * 1000
const backgroundMailboxIntervalMs = 15 * 60 * 1000

type ListMessagesParams = {
  accountPublicId?: string
  accountPublicIds?: string[]
  searchMode?: boolean
  path?: string
  specialUse?: string
  customFolders?: boolean
  pageSize: number
  cursor?: string
  q?: string
  from?: string
  to?: string
  subject?: string
  after?: string
  before?: string
  hasAttachments?: boolean
  unread?: boolean
  flagged?: boolean
}

type SyncStats = {
  mailboxes: number
  messages: number
  backfillPending: boolean
}

type MailboxSyncStats = {
  messages: number
  backfillPending: boolean
}

type MailSyncMode = "live" | "backfill"

type MailSyncParams = {
  path?: string
  pageSize?: number
  pageLimit?: number
  mode?: MailSyncMode
}

type MailReadServiceOptions = {
  connectionStartScheduler?: ImapConnectionStartScheduler
  recentBodyCacheSize?: number
  recentMessageCacheSize?: number
  onNewMessage?: (event: unknown) => void | Promise<void>
}

export type MailAttachmentDownload = {
  filename: string | null
  contentType: string
  content: Buffer
}

export class MailReadService {
  private readonly convex: MailAgentConvexClient
  private readonly mailEngine: MailEngine
  private readonly mailCredentialSecret: string
  private readonly initialSyncLimitPerMailbox: number
  private readonly recentMessageCacheSize: number
  private readonly recentBodyCacheSize: number
  private readonly accountSyncLocks = new Map<
    Id<"mailAccounts">,
    Promise<SyncStats>
  >()
  private readonly mailboxSyncLocks = new Map<
    string,
    Promise<MailboxSyncStats>
  >()
  private readonly messageBodyLoadLocks = new Map<
    string,
    Promise<LiveMessageDto | null>
  >()

  constructor(
    convex: MailAgentConvexClient,
    mailEngine: MailEngine,
    mailCredentialSecret: string,
    initialSyncLimitPerMailbox: number,
    options: MailReadServiceOptions = {}
  ) {
    this.convex = convex
    this.mailEngine = mailEngine
    this.mailCredentialSecret = mailCredentialSecret
    this.initialSyncLimitPerMailbox = initialSyncLimitPerMailbox
    this.recentMessageCacheSize = Math.max(
      1,
      options.recentMessageCacheSize ?? 300
    )
    this.recentBodyCacheSize = Math.max(1, options.recentBodyCacheSize ?? 150)
  }

  async listMailboxes(
    userId: Id<"users">,
    accountPublicId: string
  ): Promise<LiveMailboxDto[] | null> {
    let result = await this.convex.query(internal.mailInternal.listMailboxes, {
      userId,
      accountPublicId,
    })
    if (!result) return null

    if (result.mailboxes.length === 0) {
      await this.syncMailboxesWithRetry(result.account)
      result = await this.convex.query(internal.mailInternal.listMailboxes, {
        userId,
        accountPublicId,
      })
    }

    return (
      result?.mailboxes
        .map((mailbox) => ({
          path: mailbox.path,
          name: mailbox.name,
          specialUse: mailbox.specialUse ?? null,
          messagesTotal: mailbox.messagesTotal ?? null,
          messagesUnread: mailbox.messagesUnread ?? null,
          searchComplete: mailbox.syncExhaustedAt !== undefined,
        }))
        .sort(compareMailboxes) ?? null
    )
  }

  async requestAccountSync(
    userId: Id<"users">,
    accountPublicId: string,
    params: Omit<MailSyncParams, "mode"> = {}
  ): Promise<boolean> {
    const account = await this.convex.query(
      internal.accountsInternal.getByPublicId,
      { userId, publicId: accountPublicId }
    )
    if (!account) return false

    void this.syncAccountAfterCurrent(account, {
      ...params,
      mode: "live",
    }).catch((error) => {
      console.error("Requested mail sync failed", {
        accountId: account._id,
        message: getErrorMessage(error),
      })
    })
    return true
  }

  async syncAccountById(
    accountId: Id<"mailAccounts">,
    params: MailSyncParams = {}
  ): Promise<SyncStats | null> {
    const account = await this.convex.query(internal.accountsInternal.getById, {
      accountId,
    })
    return account ? this.syncAccountWithLock(account, params) : null
  }

  async syncAccountInboxById(
    accountId: Id<"mailAccounts">,
    params: { pageSize?: number; pageLimit?: number } = {}
  ) {
    return this.syncAccountById(accountId, {
      ...params,
      path: await this.findInboxPath(accountId),
      mode: "live",
    })
  }

  async syncAccountInboxAfterCurrentById(
    accountId: Id<"mailAccounts">,
    params: { pageSize?: number; pageLimit?: number } = {}
  ) {
    const path = await this.findInboxPath(accountId)
    const account = await this.convex.query(internal.accountsInternal.getById, {
      accountId,
    })
    return account
      ? this.syncAccountAfterCurrent(account, {
          ...params,
          path,
          mode: "live",
        })
      : null
  }

  async refreshAccountMailboxesById(accountId: Id<"mailAccounts">) {
    const account = await this.convex.query(internal.accountsInternal.getById, {
      accountId,
    })
    return account ? this.syncMailboxesWithRetry(account) : 0
  }

  async syncNextAccountBackfillById(
    accountId: Id<"mailAccounts">,
    params: { pageSize?: number; pageLimit?: number } = {}
  ): Promise<SyncStats | null> {
    const account = await this.convex.query(internal.accountsInternal.getById, {
      accountId,
    })
    if (!account) return null

    const result = await this.convex.query(
      internal.mailInternal.listMailboxes,
      { userId: account.userId, accountPublicId: account.publicId }
    )
    const inboxPath =
      result?.mailboxes.find(
        (mailbox) => mailbox.specialUse?.toLocaleLowerCase() === "\\inbox"
      )?.path ?? "INBOX"
    const candidates = (result?.mailboxes ?? [])
      .filter((mailbox) => mailbox.syncExhaustedAt === undefined)
      .sort((first, second) => {
        if (first.path === inboxPath) return -1
        if (second.path === inboxPath) return 1
        return 0
      })
    const mailbox = candidates[0]
    if (!mailbox) {
      return { mailboxes: 0, messages: 0, backfillPending: false }
    }

    const stats = await this.syncAccountWithLock(account, {
      ...params,
      path: mailbox.path,
      mode: "backfill",
    })
    return {
      ...stats,
      backfillPending: stats.backfillPending || candidates.length > 1,
    }
  }

  async syncNextDueSecondaryMailboxById(
    accountId: Id<"mailAccounts">,
    now = Date.now()
  ): Promise<SyncStats | null> {
    const account = await this.convex.query(internal.accountsInternal.getById, {
      accountId,
    })
    if (!account) return null

    const result = await this.convex.query(
      internal.mailInternal.listMailboxes,
      { userId: account.userId, accountPublicId: account.publicId }
    )
    const mailbox = (result?.mailboxes ?? [])
      .filter(
        (candidate) =>
          candidate.specialUse?.toLocaleLowerCase() !== "\\inbox" &&
          now - (candidate.lastStatusCheckAt ?? 0) >=
            secondaryMailboxInterval(candidate.specialUse)
      )
      .sort(
        (first, second) =>
          (first.lastStatusCheckAt ?? 0) - (second.lastStatusCheckAt ?? 0)
      )[0]
    if (!mailbox) return null

    return await this.syncAccountById(accountId, {
      path: mailbox.path,
      mode: "live",
      pageSize: 50,
      pageLimit: 1,
    })
  }

  async listMessages(
    userId: Id<"users">,
    accountPublicId: string,
    params: Omit<ListMessagesParams, "accountPublicId" | "accountPublicIds">
  ): Promise<ListStoredMessagesResponse | null> {
    const account = await this.convex.query(
      internal.accountsInternal.getByPublicId,
      { userId, publicId: accountPublicId }
    )
    if (!account) return null

    return this.listStoredMessages(userId, {
      ...params,
      accountPublicId,
    })
  }

  async listStoredMessages(
    userId: Id<"users">,
    params: ListMessagesParams
  ): Promise<ListStoredMessagesResponse> {
    const accountPublicIds = [
      ...(params.accountPublicIds ?? []),
      ...(params.accountPublicId ? [params.accountPublicId] : []),
    ]
    const page = await this.convex.query(internal.mailInternal.listMessages, {
      userId,
      accountPublicIds:
        accountPublicIds.length > 0
          ? [...new Set(accountPublicIds)]
          : undefined,
      searchMode: params.searchMode,
      path: params.path,
      specialUse: params.specialUse,
      customFolders: params.customFolders,
      q: params.q,
      from: params.from,
      to: params.to,
      subject: params.subject,
      after: parseDateBoundary(params.after),
      before: parseDateBoundary(params.before, true),
      hasAttachments: params.hasAttachments,
      unread: params.unread,
      flagged: params.flagged,
      paginationOpts: {
        cursor: params.cursor ?? null,
        numItems: params.pageSize,
      },
    })

    return {
      total: null,
      nextPageCursor: page.isDone ? null : page.continueCursor,
      messages: page.page as LiveMessageListItemDto[],
    }
  }

  async getMessage(
    userId: Id<"users">,
    accountPublicId: string,
    messagePublicId: string
  ): Promise<LiveMessageDto | null> {
    const message = await this.getStoredMessage(userId, messagePublicId)
    return message?.accountId === accountPublicId ? message : null
  }

  moveStoredMessage(
    userId: Id<"users">,
    messagePublicId: string,
    destinationPath: string
  ): Promise<LiveMessageDto | null> {
    return this.convex.mutation(internal.mailInternal.moveMessage, {
      userId,
      messagePublicId,
      destinationPath,
      clientMutationId: randomUUID(),
    }) as Promise<LiveMessageDto | null>
  }

  async getStoredMessage(
    userId: Id<"users">,
    messagePublicId: string
  ): Promise<LiveMessageDto | null> {
    const message = (await this.convex.query(internal.mailInternal.getMessage, {
      userId,
      messagePublicId,
    })) as LiveMessageDto | null
    if (!message || message.bodyStatus === "loaded") return message

    return await this.loadMessageBody(userId, messagePublicId)
  }

  listCachedStoredMessages(
    userId: Id<"users">,
    messagePublicIds: string[]
  ): Promise<LiveMessageDto[]> {
    return this.convex.query(internal.mailInternal.getMessages, {
      userId,
      messagePublicIds,
    }) as Promise<LiveMessageDto[]>
  }

  getMessageThread(
    userId: Id<"users">,
    messagePublicId: string
  ): Promise<MailMessageThreadDto | null> {
    return this.convex.query(internal.mailInternal.getThread, {
      userId,
      messagePublicId,
    }) as Promise<MailMessageThreadDto | null>
  }

  async getAttachment(
    userId: Id<"users">,
    messagePublicId: string | null,
    attachmentPublicId: string
  ): Promise<MailAttachmentDownload | null> {
    const target = await this.convex.query(
      internal.mailInternal.getAttachment,
      {
        userId,
        messagePublicId: messagePublicId ?? undefined,
        attachmentPublicId,
      }
    )
    if (!target || !target.location.uid) return null

    const credentials = await findMailAccountCredentials(
      this.convex,
      target.account._id,
      this.mailCredentialSecret
    )
    if (!credentials) return null

    const source = await this.mailEngine.fetchMessageSource(
      credentials,
      target.mailbox.path,
      Number(target.location.uid)
    )
    const content = await this.mailEngine.extractAttachment(
      source,
      target.attachment.emailengineAttachmentId
    )
    if (!content) return null

    return {
      filename: target.attachment.filename ?? null,
      contentType: target.attachment.contentType ?? "application/octet-stream",
      content: content.content,
    }
  }

  updateStoredMessage(
    userId: Id<"users">,
    messagePublicId: string,
    request: UpdateMessageRequest
  ): Promise<LiveMessageDto | null> {
    return this.convex.mutation(internal.mailInternal.updateFlags, {
      userId,
      messagePublicId,
      clientMutationId: request.clientMutationId ?? randomUUID(),
      seen: request.seen,
      flagged: request.flagged,
    }) as Promise<LiveMessageDto | null>
  }

  async applyMailboxProviderFlags(
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
  ) {
    return await this.convex.mutation(
      internal.mailInternal.applyMailboxProviderFlags,
      {
        accountId,
        mailboxPath,
        uid: String(uid),
        flags,
        modseq,
      }
    )
  }

  private syncAccountWithLock(
    account: Doc<"mailAccounts">,
    params: MailSyncParams
  ) {
    const current = this.accountSyncLocks.get(account._id)
    if (current) return current

    const operation = this.syncAccountUnlocked(account, params).finally(() => {
      this.accountSyncLocks.delete(account._id)
    })
    this.accountSyncLocks.set(account._id, operation)
    return operation
  }

  private async syncAccountAfterCurrent(
    account: Doc<"mailAccounts">,
    params: MailSyncParams
  ) {
    const current = this.accountSyncLocks.get(account._id)
    if (current) {
      try {
        await current
      } catch {
        // The requested sync reports its own provider error.
      }
    }
    return this.syncAccountWithLock(account, params)
  }

  private async syncAccountUnlocked(
    account: Doc<"mailAccounts">,
    params: MailSyncParams
  ): Promise<SyncStats> {
    const status = account.lastSyncAt ? "incremental_sync" : "initial_sync"
    await this.convex.mutation(internal.mailInternal.markAccountSync, {
      accountId: account._id,
      status,
      completed: false,
    })

    try {
      if (!params.path) {
        await this.syncMailboxesWithRetry(account)
      }
      const mailboxes = await this.convex.query(
        internal.mailInternal.listMailboxes,
        { userId: account.userId, accountPublicId: account.publicId }
      )
      const selected = (mailboxes?.mailboxes ?? []).filter(
        (mailbox) => !params.path || mailbox.path === params.path
      )
      const pageSize = params.pageSize ?? 50
      const pageLimit =
        params.pageLimit ??
        Math.max(1, Math.ceil(this.recentMessageCacheSize / pageSize))
      let messages = 0
      let backfillPending = false

      for (const mailbox of selected) {
        const result = await this.syncMailboxMessages(
          account,
          mailbox,
          pageSize * pageLimit,
          params.mode ?? "live"
        )
        messages += result.messages
        backfillPending ||= result.backfillPending
      }

      await this.convex.mutation(internal.mailInternal.markAccountSync, {
        accountId: account._id,
        status: "idle",
        completed: true,
      })
      return { mailboxes: selected.length, messages, backfillPending }
    } catch (error) {
      await this.convex.mutation(internal.mailInternal.markAccountSync, {
        accountId: account._id,
        status: "failed",
        lastError: getErrorMessage(error),
        completed: false,
      })
      throw error
    }
  }

  private async syncMailboxesWithRetry(account: Doc<"mailAccounts">) {
    let lastError: unknown
    for (
      let attempt = 0;
      attempt <= mailboxSyncRetryDelaysMs.length;
      attempt += 1
    ) {
      try {
        return await this.syncMailboxes(account)
      } catch (error) {
        lastError = error
        const delay = mailboxSyncRetryDelaysMs[attempt]
        if (delay === undefined) break
        await new Promise<void>((resolve) => setTimeout(resolve, delay))
      }
    }
    throw lastError
  }

  private async syncMailboxes(account: Doc<"mailAccounts">) {
    const credentials = await findMailAccountCredentials(
      this.convex,
      account._id,
      this.mailCredentialSecret
    )
    if (!credentials) {
      throw new Error("Mail account credentials are unavailable")
    }

    const [remote, stored] = await Promise.all([
      this.mailEngine.listMailboxes(credentials),
      this.convex.query(internal.mailInternal.listMailboxes, {
        userId: account.userId,
        accountPublicId: account.publicId,
      }),
    ])
    await this.convex.mutation(internal.mailInternal.upsertMailboxes, {
      accountId: account._id,
      mailboxes: remote.map((mailbox) => ({
        publicId:
          stored?.mailboxes.find((candidate) => candidate.path === mailbox.path)
            ?.publicId ?? randomUUID(),
        path: mailbox.path,
        name: mailbox.name,
        specialUse: mailbox.specialUse ?? undefined,
        uidValidity: mailbox.uidValidity ?? undefined,
        messagesTotal: mailbox.messagesTotal ?? undefined,
        messagesUnread: mailbox.messagesUnread ?? undefined,
        highestUid: mailbox.highestUid ?? undefined,
        highestModseq: mailbox.highestModseq ?? undefined,
      })),
    })
    return remote.length
  }

  private syncMailboxMessages(
    account: Doc<"mailAccounts">,
    mailbox: Doc<"mailboxes">,
    limit: number,
    mode: MailSyncMode
  ) {
    const key = `${account._id}:${mailbox.path}`
    const current = this.mailboxSyncLocks.get(key)
    if (current) return current

    const operation = this.syncMailboxMessagesUnlocked(
      account,
      mailbox,
      limit,
      mode
    ).finally(() => {
      this.mailboxSyncLocks.delete(key)
    })
    this.mailboxSyncLocks.set(key, operation)
    return operation
  }

  private async syncMailboxMessagesUnlocked(
    account: Doc<"mailAccounts">,
    mailbox: Doc<"mailboxes">,
    limit: number,
    mode: MailSyncMode
  ) {
    const credentials = await findMailAccountCredentials(
      this.convex,
      account._id,
      this.mailCredentialSecret
    )
    if (!credentials) {
      throw new Error("Mail account credentials are unavailable")
    }

    const includeLive = mode === "live"
    const includeBackfill = mode === "backfill"
    let liveStatus: MailEngineMailboxStatus | null = null
    let liveUidCursor = mailbox.liveUidCursor
    const liveModseqCursor = mailbox.liveModseqCursor
    let liveUidValidity = mailbox.uidValidity
    let liveUidValidityChanged = false
    let liveBatches: FetchMessageMetadataBatchResult[] = []

    if (includeLive) {
      const statusStartedAt = Date.now()
      const liveState = await this.mailEngine.fetchMailboxLiveState(
        credentials,
        mailbox.path,
        {
          uidValidity: mailbox.uidValidity,
          liveUidCursor,
          liveModseqCursor,
          initialLimit: Math.max(
            1,
            Math.min(limit, this.initialSyncLimitPerMailbox)
          ),
          unreadExpectedCount: mailbox.providerMessagesUnread,
        }
      )
      liveStatus = liveState.status
      liveBatches = liveState.batches
      const checkedAt = Date.now()
      liveUidValidityChanged =
        liveStatus.uidValidity !== null &&
        mailbox.uidValidity !== undefined &&
        mailbox.uidValidity !== liveStatus.uidValidity
      const statusChanged =
        liveUidValidityChanged ||
        providerValueChanged(
          mailbox.providerMessagesTotal,
          liveStatus.messagesTotal
        ) ||
        providerValueChanged(
          mailbox.providerMessagesUnread,
          liveStatus.messagesUnread
        ) ||
        providerValueChanged(mailbox.highestUid, liveStatus.highestUid) ||
        providerValueChanged(mailbox.highestModseq, liveStatus.highestModseq)

      await this.convex.mutation(internal.mailInternal.recordMailboxStatus, {
        mailboxId: mailbox._id,
        uidValidity: liveStatus.uidValidity ?? undefined,
        messagesTotal: liveStatus.messagesTotal ?? undefined,
        messagesUnread: liveStatus.messagesUnread ?? undefined,
        highestUid: liveStatus.highestUid ?? undefined,
        highestModseq: liveStatus.highestModseq ?? undefined,
        checkedAt,
        changed: statusChanged,
      })

      if (liveUidValidityChanged) {
        liveUidCursor = undefined
      }
      liveUidValidity = liveStatus.uidValidity ?? mailbox.uidValidity

      if (account.provider === "beget" || statusChanged) {
        console.info("Mail mailbox status checked", {
          accountId: account._id,
          mailboxPath: mailbox.path,
          provider: account.provider,
          durationMs: checkedAt - statusStartedAt,
          changed: statusChanged,
          highestUid: liveStatus.highestUid,
          messagesUnread: liveStatus.messagesUnread,
        })
      }
    }

    const syncMailbox =
      liveUidValidity !== mailbox.uidValidity
        ? { ...mailbox, uidValidity: liveUidValidity }
        : mailbox
    if (includeLive && liveUidValidityChanged) {
      await this.reconcileMailboxLocations(mailbox, credentials, true)
    }
    const syncCursor = Number(mailbox.syncCursor ?? mailbox.highestUid ?? 0)
    const backfillToUid =
      mailbox.syncExhaustedAt === undefined &&
      Number.isInteger(syncCursor) &&
      syncCursor > 0
        ? syncCursor
        : null
    const backfillFromUid =
      backfillToUid === null
        ? null
        : Math.max(1, backfillToUid - backfillBatchSize + 1)
    const initialLiveSync = includeLive && liveUidCursor === undefined
    const liveHighestUid =
      liveStatus?.highestUid ?? mailbox.highestUid ?? liveUidCursor ?? 0
    const backfillItems =
      includeBackfill && backfillFromUid !== null && backfillToUid !== null
        ? [
            {
              key: "backfill",
              options: {
                fromUid: backfillFromUid,
                toUid: backfillToUid,
              },
            },
          ]
        : []
    const backfillBatches =
      backfillItems.length > 0
        ? await this.mailEngine.fetchMessageMetadataBatch(
            credentials,
            mailbox.path,
            backfillItems
          )
        : []
    const batches = [...liveBatches, ...backfillBatches]
    const messagesByBatch = new Map(
      batches.map((batch) => [batch.key, batch.messages])
    )
    const recent = messagesByBatch.get("recent") ?? []
    const recentUids = new Set(recent.map((message) => message.uid))
    const unread = (messagesByBatch.get("unread") ?? []).filter(
      (message) => !recentUids.has(message.uid)
    )
    const newMessages = messagesByBatch.get("new") ?? []
    const changedMessages = messagesByBatch.get("changed") ?? []
    const live = uniqueMessages([
      ...recent,
      ...unread,
      ...newMessages,
      ...changedMessages,
    ])
    const liveUids = new Set(live.map((message) => message.uid))
    const backfill = uniqueMessages(
      (messagesByBatch.get("backfill") ?? []).filter(
        (message) => !liveUids.has(message.uid)
      )
    )
    const bodyCandidates = initialLiveSync
      ? uniqueMessages([...recent.slice(-this.recentBodyCacheSize), ...unread])
      : uniqueMessages(newMessages)
    const emitPushEvents = account.lastSyncAt !== undefined
    const pushPreviewCandidates =
      emitPushEvents && mailbox.specialUse?.toLocaleLowerCase() === "\\inbox"
        ? newMessages
        : []
    let pushPreviewMessages: Array<
      MailEngineMessageMetadata & { parsed: MailEngineParsedMessage }
    > = []

    if (pushPreviewCandidates.length > 0) {
      try {
        pushPreviewMessages = await this.mailEngine.fetchMessages(
          credentials,
          mailbox.path,
          pushPreviewCandidates.map((message) => message.uid)
        )
      } catch (error) {
        console.error("Mail push preview load failed", {
          accountId: account._id,
          mailboxPath: mailbox.path,
          message: getErrorMessage(error),
        })
      }
    }

    const pushPreviewByUid = new Map(
      pushPreviewMessages.map((message) => [message.uid, message])
    )

    await this.ingestMailboxMessages(
      account,
      syncMailbox,
      live,
      pushPreviewByUid,
      emitPushEvents
    )
    await this.ingestMailboxMessages(
      account,
      syncMailbox,
      backfill,
      new Map(),
      false
    )

    if (includeLive) {
      const nextLiveUidCursor = Math.max(
        liveUidCursor ?? 0,
        liveHighestUid,
        ...live.map((message) => message.uid)
      )
      await this.convex.mutation(internal.mailInternal.commitMailboxLiveSync, {
        mailboxId: mailbox._id,
        uidValidity: liveUidValidity,
        liveUidCursor: nextLiveUidCursor,
        liveModseqCursor: liveStatus?.highestModseq ?? undefined,
        syncedAt: Date.now(),
      })

      if (
        !liveUidValidityChanged &&
        liveStatus?.messagesTotal != null &&
        mailbox.providerMessagesTotal !== undefined &&
        liveStatus.messagesTotal < mailbox.providerMessagesTotal
      ) {
        await this.reconcileMailboxLocations(mailbox, credentials, false)
      }

      const expectedUnread =
        mailbox.providerMessagesUnread === undefined
          ? null
          : mailbox.providerMessagesUnread +
            newMessages.filter((message) => !message.flags.seen).length
      const needsLegacyFlagReconcile =
        !initialLiveSync &&
        liveStatus?.highestModseq === null &&
        liveStatus.messagesUnread !== null &&
        expectedUnread !== null &&
        liveStatus.messagesUnread !== expectedUnread
      if (needsLegacyFlagReconcile) {
        await this.reconcileMailboxFlags(account, mailbox, credentials)
      }
    }

    const remainingBodyCandidates = bodyCandidates.filter(
      (message) => !pushPreviewByUid.has(message.uid)
    )
    if (remainingBodyCandidates.length > 0) {
      void this.warmMailboxBodies(
        account,
        syncMailbox,
        credentials,
        remainingBodyCandidates
      )
    }

    const backfillExhausted =
      mailbox.syncExhaustedAt !== undefined ||
      backfillFromUid === null ||
      backfillFromUid === 1
    if (includeBackfill && mailbox.syncExhaustedAt === undefined) {
      await this.convex.mutation(
        internal.mailInternal.updateMailboxSyncCursor,
        {
          mailboxId: mailbox._id,
          syncCursor:
            backfillFromUid !== null && backfillFromUid > 1
              ? String(backfillFromUid - 1)
              : undefined,
          exhausted: backfillExhausted,
        }
      )
    }

    return {
      messages: live.length + backfill.length,
      backfillPending:
        mailbox.syncExhaustedAt === undefined &&
        (!includeBackfill || !backfillExhausted),
    }
  }

  private async ingestMailboxMessages(
    account: Doc<"mailAccounts">,
    mailbox: Doc<"mailboxes">,
    messages: MailEngineMessageMetadata[],
    parsedByUid: Map<
      number,
      MailEngineMessageMetadata & { parsed: MailEngineParsedMessage }
    >,
    emitPushEvents: boolean
  ) {
    for (
      let offset = 0;
      offset < messages.length;
      offset += ingestionBatchSize
    ) {
      await this.convex.mutation(internal.mailInternal.ingestMessages, {
        accountId: account._id,
        mailboxPublicId: mailbox.publicId,
        emitPushEvents,
        messages: messages
          .slice(offset, offset + ingestionBatchSize)
          .map((message) =>
            toMessageInput(
              message,
              mailbox,
              parsedByUid.get(message.uid)?.parsed
            )
          ),
      })
    }
  }

  private async reconcileMailboxFlags(
    account: Doc<"mailAccounts">,
    mailbox: Doc<"mailboxes">,
    credentials: Awaited<ReturnType<typeof findMailAccountCredentials>>
  ) {
    if (!credentials) return
    const states = await this.mailEngine.fetchMailboxFlagStates(
      credentials,
      mailbox.path
    )
    for (
      let offset = 0;
      offset < states.length;
      offset += reconciliationBatchSize
    ) {
      await this.convex.mutation(
        internal.mailInternal.applyMailboxProviderFlagBatch,
        {
          accountId: account._id,
          mailboxPath: mailbox.path,
          states: states
            .slice(offset, offset + reconciliationBatchSize)
            .map((state) => ({
              uid: String(state.uid),
              flags: state.flags,
              modseq: state.modseq ?? undefined,
            })),
        }
      )
    }
  }

  private async warmMailboxBodies(
    account: Doc<"mailAccounts">,
    mailbox: Doc<"mailboxes">,
    credentials: NonNullable<
      Awaited<ReturnType<typeof findMailAccountCredentials>>
    >,
    candidates: MailEngineMessageMetadata[]
  ) {
    try {
      const candidateUids = candidates.map((message) => String(message.uid))
      const uidStates = []
      for (
        let offset = 0;
        offset < candidateUids.length;
        offset += uidInspectionBatchSize
      ) {
        uidStates.push(
          ...(await this.convex.query(
            internal.mailInternal.inspectMailboxUids,
            {
              mailboxPublicId: mailbox.publicId,
              uids: candidateUids.slice(
                offset,
                offset + uidInspectionBatchSize
              ),
            }
          ))
        )
      }
      const missingBodyUids = uidStates
        .filter((state) => state.bodyMissing)
        .map((state) => Number(state.uid))
        .sort((first, second) => first - second)
        .slice(-bodyWarmBatchSize)
      if (missingBodyUids.length === 0) return

      const messages = await this.mailEngine.fetchMessages(
        credentials,
        mailbox.path,
        missingBodyUids
      )
      const parsedByUid = new Map(
        messages.map((message) => [message.uid, message])
      )
      await this.ingestMailboxMessages(
        account,
        mailbox,
        messages,
        parsedByUid,
        false
      )
    } catch (error) {
      console.error("Mail body warmup failed", {
        accountId: account._id,
        mailboxPath: mailbox.path,
        message: getErrorMessage(error),
      })
    }
  }

  private async reconcileMailboxLocations(
    mailbox: Doc<"mailboxes">,
    credentials: Awaited<ReturnType<typeof findMailAccountCredentials>>,
    uidValidityChanged: boolean
  ) {
    if (!credentials) return
    const storedUids = await this.convex.query(
      internal.mailInternal.listMailboxStoredUids,
      { mailboxId: mailbox._id }
    )
    const providerUids = uidValidityChanged
      ? new Set<number>()
      : new Set(
          await this.mailEngine.listMailboxUids(credentials, mailbox.path)
        )
    const removedUids = storedUids.filter(
      (uid) => !providerUids.has(Number(uid))
    )
    for (
      let offset = 0;
      offset < removedUids.length;
      offset += reconciliationBatchSize
    ) {
      await this.convex.mutation(
        internal.mailInternal.removeMailboxMessagesByUid,
        {
          mailboxId: mailbox._id,
          uids: removedUids.slice(offset, offset + reconciliationBatchSize),
        }
      )
    }
  }

  private async findInboxPath(accountId: Id<"mailAccounts">) {
    const account = await this.convex.query(internal.accountsInternal.getById, {
      accountId,
    })
    if (!account) return "INBOX"
    const result = await this.convex.query(
      internal.mailInternal.listMailboxes,
      { userId: account.userId, accountPublicId: account.publicId }
    )
    return (
      result?.mailboxes.find(
        (mailbox) => mailbox.specialUse?.toLocaleLowerCase() === "\\inbox"
      )?.path ?? "INBOX"
    )
  }

  private loadMessageBody(userId: Id<"users">, messagePublicId: string) {
    const current = this.messageBodyLoadLocks.get(messagePublicId)
    if (current) return current

    const operation = this.loadMessageBodyUnlocked(
      userId,
      messagePublicId
    ).finally(() => {
      this.messageBodyLoadLocks.delete(messagePublicId)
    })
    this.messageBodyLoadLocks.set(messagePublicId, operation)
    return operation
  }

  private async loadMessageBodyUnlocked(
    userId: Id<"users">,
    messagePublicId: string
  ): Promise<LiveMessageDto | null> {
    const target = await this.convex.query(
      internal.mailInternal.getMessageProviderData,
      { userId, messagePublicId }
    )
    if (!target?.location.uid) return null

    const credentials = await findMailAccountCredentials(
      this.convex,
      target.account._id,
      this.mailCredentialSecret
    )
    if (!credentials) return null

    const message = await this.mailEngine.fetchMessage(
      credentials,
      target.mailbox.path,
      Number(target.location.uid)
    )
    return this.convex.mutation(internal.mailInternal.hydrateMessage, {
      userId,
      messagePublicId,
      textBody: message.parsed.text ?? undefined,
      htmlBody: message.parsed.html ?? undefined,
      attachments: message.parsed.attachments.map((attachment) =>
        toAttachmentInput(attachment)
      ),
    }) as Promise<LiveMessageDto | null>
  }
}

function toMessageInput(
  message: MailEngineMessageMetadata,
  mailbox: Doc<"mailboxes">,
  parsed?: MailEngineParsedMessage
) {
  const providerId =
    message.emailId ??
    message.messageId ??
    `${mailbox.path}:${mailbox.uidValidity ?? ""}:${message.uid}`
  return {
    publicId: randomUUID(),
    computedThreadKey: createThreadKey(message),
    messageKey: providerId,
    emailengineMessageId: providerId,
    internetMessageId: message.messageId ?? undefined,
    inReplyTo: message.inReplyTo ?? undefined,
    references: message.references,
    subject: message.subject ?? undefined,
    from: message.from ? normalizeAddress(message.from) : undefined,
    to: message.to.map(normalizeAddress),
    cc: message.cc.map(normalizeAddress),
    bcc: message.bcc.map(normalizeAddress),
    sentAt: message.sentAt?.getTime(),
    receivedAt: message.receivedAt?.getTime(),
    snippet: parsed?.snippet ?? message.snippet ?? undefined,
    flags: message.flags,
    labels: message.labels,
    hasAttachments:
      (parsed?.attachments.length ?? 0) > 0 || message.hasAttachments,
    uid: String(message.uid),
    uidValidity: mailbox.uidValidity,
    textBody: parsed?.text ?? undefined,
    htmlBody: parsed?.html ?? undefined,
    attachments: (parsed?.attachments ?? message.attachments).map(
      toAttachmentInput
    ),
  }
}

function uniqueMessages(messages: MailEngineMessageMetadata[]) {
  return [
    ...new Map(messages.map((message) => [message.uid, message])).values(),
  ]
}

function providerValueChanged<T>(stored: T | undefined, provider: T | null) {
  return provider !== null && stored !== provider
}

function secondaryMailboxInterval(specialUse: string | undefined) {
  const normalized = specialUse?.toLocaleLowerCase()
  return normalized === "\\sent" || normalized === "\\drafts"
    ? frequentlyChangingMailboxIntervalMs
    : backgroundMailboxIntervalMs
}

function toAttachmentInput(attachment: MailEngineAttachment) {
  return {
    publicId: randomUUID(),
    partId: attachment.part ?? undefined,
    emailengineAttachmentId: attachment.id,
    filename: attachment.filename ?? undefined,
    contentType: attachment.contentType ?? undefined,
    sizeBytes: attachment.sizeBytes ?? undefined,
    contentId: attachment.contentId ?? undefined,
    isInline: attachment.inline,
  }
}

function normalizeAddress(address: { address: string; name?: string | null }) {
  return {
    address: address.address,
    name: address.name ?? undefined,
  }
}

function createThreadKey(message: MailEngineMessageMetadata) {
  if (message.threadId) return `provider:${message.threadId}`
  const reference =
    message.references.at(-1) ?? message.inReplyTo ?? message.messageId
  if (reference) return `header:${reference.trim().toLocaleLowerCase()}`
  return `subject:${(message.subject ?? "(no subject)")
    .replace(/^(re|fw|fwd):\s*/i, "")
    .trim()
    .toLocaleLowerCase()}`
}

function parseDateBoundary(value: string | undefined, inclusiveEnd = false) {
  if (value === undefined) return undefined

  const boundary = new Date(`${value}T00:00:00`).getTime()
  return inclusiveEnd ? boundary + 24 * 60 * 60 * 1000 : boundary
}

function compareMailboxes(first: LiveMailboxDto, second: LiveMailboxDto) {
  const firstOrder = mailboxOrder.get(first.specialUse ?? "") ?? 100
  const secondOrder = mailboxOrder.get(second.specialUse ?? "") ?? 100
  return firstOrder - secondOrder || first.name.localeCompare(second.name)
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
