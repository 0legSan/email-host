import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { internalMutation, internalQuery } from "./_generated/server"
import { synchronizeMessageListEntryFlags } from "./lib/mailListEntryFlags"
import { applyMailboxCountDelta } from "./lib/mailboxCounts"
import {
  getMailSearchIndexEqualityFilters,
  getMailTextSearchPlan,
  matchesSecondaryMailTextCriteria,
} from "./mailSearch"

const mailAddress = v.object({
  address: v.string(),
  name: v.optional(v.string()),
})
const messageFlags = v.object({
  seen: v.boolean(),
  flagged: v.boolean(),
  answered: v.boolean(),
  forwarded: v.boolean(),
  draft: v.boolean(),
})
const mailboxInput = v.object({
  publicId: v.string(),
  path: v.string(),
  name: v.string(),
  specialUse: v.optional(v.string()),
  uidValidity: v.optional(v.string()),
  messagesTotal: v.optional(v.number()),
  messagesUnread: v.optional(v.number()),
  highestUid: v.optional(v.number()),
  highestModseq: v.optional(v.string()),
})
const attachmentInput = v.object({
  publicId: v.string(),
  partId: v.optional(v.string()),
  emailengineAttachmentId: v.string(),
  filename: v.optional(v.string()),
  contentType: v.optional(v.string()),
  sizeBytes: v.optional(v.number()),
  contentId: v.optional(v.string()),
  isInline: v.boolean(),
})

const messageInput = v.object({
  publicId: v.string(),
  computedThreadKey: v.string(),
  messageKey: v.string(),
  emailengineMessageId: v.string(),
  internetMessageId: v.optional(v.string()),
  inReplyTo: v.optional(v.string()),
  references: v.array(v.string()),
  subject: v.optional(v.string()),
  from: v.optional(mailAddress),
  to: v.array(mailAddress),
  cc: v.array(mailAddress),
  bcc: v.array(mailAddress),
  sentAt: v.optional(v.number()),
  receivedAt: v.optional(v.number()),
  snippet: v.optional(v.string()),
  flags: messageFlags,
  labels: v.array(v.string()),
  hasAttachments: v.boolean(),
  uid: v.string(),
  uidValidity: v.optional(v.string()),
  textBody: v.optional(v.string()),
  htmlBody: v.optional(v.string()),
  attachments: v.array(attachmentInput),
})

export const listMailboxes = internalQuery({
  args: {
    userId: v.id("users"),
    accountPublicId: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await findOwnedAccount(
      ctx,
      args.userId,
      args.accountPublicId
    )
    if (!account) return null

    const mailboxes = await ctx.db
      .query("mailboxes")
      .withIndex("by_account", (queryBuilder) =>
        queryBuilder.eq("accountId", account._id)
      )
      .collect()
    return {
      account,
      mailboxes: mailboxes.filter((mailbox) => mailbox.deletedAt === undefined),
    }
  },
})

export const upsertMailboxes = internalMutation({
  args: {
    accountId: v.id("mailAccounts"),
    mailboxes: v.array(mailboxInput),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const seenIds: Id<"mailboxes">[] = []

    for (const input of args.mailboxes) {
      const {
        messagesTotal: providerMessagesTotal,
        messagesUnread: providerMessagesUnread,
        ...mailboxInput
      } = input
      const mailboxKey = createMailboxKey(
        args.accountId,
        input.path,
        input.uidValidity
      )
      let existing = await ctx.db
        .query("mailboxes")
        .withIndex("by_account_mailbox_key", (queryBuilder) =>
          queryBuilder.eq("mailboxKey", mailboxKey)
        )
        .unique()
      if (!existing) {
        const accountMailboxes = await ctx.db
          .query("mailboxes")
          .withIndex("by_account", (queryBuilder) =>
            queryBuilder.eq("accountId", args.accountId)
          )
          .collect()
        existing =
          accountMailboxes.find(
            (mailbox) =>
              mailbox.path === input.path && mailbox.deletedAt === undefined
          ) ?? null
      }

      if (existing) {
        await ctx.db.patch(existing._id, {
          ...mailboxInput,
          mailboxKey,
          providerMessagesTotal,
          providerMessagesUnread,
          ...(existing.uidValidity !== input.uidValidity
            ? {
                liveUidCursor: undefined,
                liveModseqCursor: undefined,
                syncCursor: undefined,
                syncExhaustedAt: undefined,
              }
            : {}),
          deletedAt: undefined,
          updatedAt: now,
        })
        seenIds.push(existing._id)
      } else {
        seenIds.push(
          await ctx.db.insert("mailboxes", {
            accountId: args.accountId,
            mailboxKey,
            ...mailboxInput,
            messagesTotal: 0,
            messagesUnread: 0,
            providerMessagesTotal,
            providerMessagesUnread,
            createdAt: now,
            updatedAt: now,
          })
        )
      }
    }

    const stored = await ctx.db
      .query("mailboxes")
      .withIndex("by_account", (queryBuilder) =>
        queryBuilder.eq("accountId", args.accountId)
      )
      .collect()
    const activeIds = new Set(seenIds)
    for (const mailbox of stored) {
      if (mailbox.deletedAt === undefined && !activeIds.has(mailbox._id)) {
        await ctx.db.patch(mailbox._id, {
          deletedAt: now,
          updatedAt: now,
        })
      }
    }

    return seenIds.length
  },
})

export const ingestMessages = internalMutation({
  args: {
    accountId: v.id("mailAccounts"),
    mailboxPublicId: v.string(),
    emitPushEvents: v.boolean(),
    messages: v.array(messageInput),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId)
    const mailbox = await ctx.db
      .query("mailboxes")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.mailboxPublicId)
      )
      .unique()

    if (
      !account ||
      account.deletedAt !== undefined ||
      !mailbox ||
      mailbox.accountId !== account._id ||
      mailbox.deletedAt !== undefined
    ) {
      return { ingested: 0, newInboxMessages: 0 }
    }

    let newInboxMessages = 0
    let totalDelta = 0
    let unreadDelta = 0
    for (const input of args.messages) {
      const result = await upsertMessage(
        ctx,
        account,
        mailbox,
        input,
        args.emitPushEvents
      )
      if (result.newInboxMessage) {
        newInboxMessages += 1
      }
      totalDelta += result.totalDelta
      unreadDelta += result.unreadDelta
    }

    const now = Date.now()
    await applyMailboxCountDelta(
      ctx,
      mailbox._id,
      { total: totalDelta, unread: unreadDelta },
      now
    )
    await ctx.db.patch(mailbox._id, { lastMessageSyncAt: now })
    return {
      ingested: args.messages.length,
      newInboxMessages,
    }
  },
})

export const rebuildMailboxCounts = internalMutation({
  args: {
    mailboxPublicId: v.string(),
  },
  handler: async (ctx, args) => {
    const mailbox = await ctx.db
      .query("mailboxes")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.mailboxPublicId)
      )
      .unique()
    if (!mailbox) return null

    const account = await ctx.db.get(mailbox.accountId)
    if (!account) return null

    const entries = await ctx.db
      .query("mailListEntries")
      .withIndex("by_user_mailbox_sort", (queryBuilder) =>
        queryBuilder.eq("userId", account.userId).eq("mailboxId", mailbox._id)
      )
      .collect()
    const visible = entries.filter((entry) => entry.visible)
    const messagesTotal = visible.length
    const messagesUnread = visible.filter((entry) => !entry.seen).length

    await ctx.db.patch(mailbox._id, {
      messagesTotal,
      messagesUnread,
      updatedAt: Date.now(),
    })
    return {
      messagesTotal,
      messagesUnread,
    }
  },
})

export const backfillListEntryReadFields = internalMutation({
  args: {
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("mailListEntries")
      .paginate({ cursor: args.cursor ?? null, numItems: 50 })
    let updated = 0

    for (const entry of page.page) {
      if (entry.messagePublicId && entry.accountPublicId) {
        continue
      }
      const [message, account] = await Promise.all([
        ctx.db.get(entry.messageId),
        ctx.db.get(entry.accountId),
      ])
      if (!message || !account) continue

      await ctx.db.patch(entry._id, {
        messagePublicId: message.publicId,
        accountPublicId: account.publicId,
        sentAt: message.sentAt,
      })
      updated += 1
    }

    return {
      cursor: page.continueCursor,
      done: page.isDone,
      updated,
    }
  },
})

export const inspectMailboxUids = internalQuery({
  args: {
    mailboxPublicId: v.string(),
    uids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const mailbox = await ctx.db
      .query("mailboxes")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.mailboxPublicId)
      )
      .unique()
    if (!mailbox) return []

    return await Promise.all(
      args.uids.map(async (uid) => {
        const mailboxUidKey = `${mailbox._id}:${mailbox.uidValidity ?? ""}:${uid}`
        const location = await ctx.db
          .query("mailMessageLocations")
          .withIndex("by_mailbox_uid_key", (queryBuilder) =>
            queryBuilder.eq("mailboxUidKey", mailboxUidKey)
          )
          .unique()
        const message = location ? await ctx.db.get(location.messageId) : null
        return {
          uid,
          isNew: !message || message.deletedAt !== undefined,
          bodyMissing: !message || message.bodyStatus !== "loaded",
        }
      })
    )
  },
})

export const updateMailboxSyncCursor = internalMutation({
  args: {
    mailboxId: v.id("mailboxes"),
    syncCursor: v.optional(v.string()),
    exhausted: v.boolean(),
  },
  handler: async (ctx, args) => {
    const mailbox = await ctx.db.get(args.mailboxId)
    if (!mailbox) return
    await ctx.db.patch(mailbox._id, {
      syncCursor: args.syncCursor,
      syncExhaustedAt: args.exhausted ? Date.now() : undefined,
      updatedAt: Date.now(),
    })
  },
})

export const recordMailboxStatus = internalMutation({
  args: {
    mailboxId: v.id("mailboxes"),
    uidValidity: v.optional(v.string()),
    messagesTotal: v.optional(v.number()),
    messagesUnread: v.optional(v.number()),
    highestUid: v.optional(v.number()),
    highestModseq: v.optional(v.string()),
    checkedAt: v.number(),
    changed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const mailbox = await ctx.db.get(args.mailboxId)
    if (!mailbox) return null

    const uidValidityChanged =
      args.uidValidity !== undefined &&
      mailbox.uidValidity !== undefined &&
      mailbox.uidValidity !== args.uidValidity
    const uidValidity = args.uidValidity ?? mailbox.uidValidity

    await ctx.db.patch(mailbox._id, {
      uidValidity,
      mailboxKey: createMailboxKey(
        mailbox.accountId,
        mailbox.path,
        uidValidity
      ),
      providerMessagesTotal: args.messagesTotal,
      providerMessagesUnread: args.messagesUnread,
      highestUid: args.highestUid,
      highestModseq: args.highestModseq,
      lastStatusCheckAt: args.checkedAt,
      lastStatusChangeAt: args.changed
        ? args.checkedAt
        : mailbox.lastStatusChangeAt,
      ...(uidValidityChanged
        ? {
            liveUidCursor: undefined,
            liveModseqCursor: undefined,
            syncCursor: undefined,
            syncExhaustedAt: undefined,
          }
        : {}),
      updatedAt: args.checkedAt,
    })

    return { uidValidityChanged }
  },
})

export const commitMailboxLiveSync = internalMutation({
  args: {
    mailboxId: v.id("mailboxes"),
    uidValidity: v.optional(v.string()),
    liveUidCursor: v.number(),
    liveModseqCursor: v.optional(v.string()),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const mailbox = await ctx.db.get(args.mailboxId)
    if (!mailbox) return false
    if (
      args.uidValidity !== undefined &&
      mailbox.uidValidity !== undefined &&
      mailbox.uidValidity !== args.uidValidity
    ) {
      return false
    }

    await ctx.db.patch(mailbox._id, {
      liveUidCursor: Math.max(mailbox.liveUidCursor ?? 0, args.liveUidCursor),
      liveModseqCursor: args.liveModseqCursor ?? mailbox.liveModseqCursor,
      lastMessageSyncAt: args.syncedAt,
      updatedAt: args.syncedAt,
    })
    return true
  },
})

export const applyMailboxProviderFlags = internalMutation({
  args: {
    accountId: v.id("mailAccounts"),
    mailboxPath: v.string(),
    uid: v.string(),
    flags: messageFlags,
    modseq: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const mailbox = await findActiveMailboxByPath(
      ctx,
      args.accountId,
      args.mailboxPath
    )
    if (!mailbox) return false

    return applyProviderFlags(ctx, mailbox, args)
  },
})

export const applyMailboxProviderFlagBatch = internalMutation({
  args: {
    accountId: v.id("mailAccounts"),
    mailboxPath: v.string(),
    states: v.array(
      v.object({
        uid: v.string(),
        flags: messageFlags,
        modseq: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const mailbox = await findActiveMailboxByPath(
      ctx,
      args.accountId,
      args.mailboxPath
    )
    if (!mailbox) return 0

    let applied = 0
    for (const state of args.states) {
      if (await applyProviderFlags(ctx, mailbox, state)) {
        applied += 1
      }
    }
    return applied
  },
})

export const listMailboxStoredUids = internalQuery({
  args: {
    mailboxId: v.id("mailboxes"),
  },
  handler: async (ctx, args) => {
    const locations = await ctx.db
      .query("mailMessageLocations")
      .withIndex("by_mailbox", (queryBuilder) =>
        queryBuilder.eq("mailboxId", args.mailboxId)
      )
      .collect()
    return locations.flatMap((location) =>
      location.uid === undefined ? [] : [location.uid]
    )
  },
})

export const removeMailboxMessagesByUid = internalMutation({
  args: {
    mailboxId: v.id("mailboxes"),
    uids: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const mailbox = await ctx.db.get(args.mailboxId)
    if (!mailbox) return 0

    const mailboxLocations = await ctx.db
      .query("mailMessageLocations")
      .withIndex("by_mailbox", (queryBuilder) =>
        queryBuilder.eq("mailboxId", mailbox._id)
      )
      .collect()
    const locationByUid = new Map(
      mailboxLocations.flatMap((location) =>
        location.uid === undefined ? [] : [[location.uid, location] as const]
      )
    )
    let removed = 0
    for (const uid of args.uids) {
      const location = locationByUid.get(uid)
      if (!location) continue

      const message = await ctx.db.get(location.messageId)
      if (!message) {
        await ctx.db.delete(location._id)
        removed += 1
        continue
      }

      const now = Date.now()
      const entry = await ctx.db
        .query("mailListEntries")
        .withIndex("by_entry_key", (queryBuilder) =>
          queryBuilder.eq("entryKey", `${mailbox._id}:${message._id}`)
        )
        .unique()
      if (entry?.visible) {
        await ctx.db.patch(entry._id, {
          visible: false,
          updatedAt: now,
        })
        await applyMailboxCountDeltas(
          ctx,
          new Map([[mailbox._id, { total: -1, unread: entry.seen ? 0 : -1 }]]),
          now
        )
      }

      await ctx.db.delete(location._id)
      const remainingLocations = await ctx.db
        .query("mailMessageLocations")
        .withIndex("by_message", (queryBuilder) =>
          queryBuilder.eq("messageId", message._id)
        )
        .take(1)
      if (remainingLocations.length === 0) {
        await ctx.db.patch(message._id, {
          deletedAt: now,
          updatedAt: now,
        })
        await refreshThread(ctx, message.threadId)
      }
      removed += 1
    }
    return removed
  },
})

export const markAccountSync = internalMutation({
  args: {
    accountId: v.id("mailAccounts"),
    status: v.union(
      v.literal("idle"),
      v.literal("initial_sync"),
      v.literal("incremental_sync"),
      v.literal("failed"),
      v.literal("paused")
    ),
    lastError: v.optional(v.string()),
    completed: v.boolean(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId)
    if (!account) return

    const now = Date.now()
    await ctx.db.patch(account._id, {
      syncStatus: args.status,
      lastError: args.lastError,
      lastSyncAt: args.completed ? now : account.lastSyncAt,
      updatedAt: now,
    })
  },
})

export const listMessages = internalQuery({
  args: {
    userId: v.id("users"),
    accountPublicIds: v.optional(v.array(v.string())),
    searchMode: v.optional(v.boolean()),
    path: v.optional(v.string()),
    specialUse: v.optional(v.string()),
    customFolders: v.optional(v.boolean()),
    q: v.optional(v.string()),
    from: v.optional(v.string()),
    to: v.optional(v.string()),
    subject: v.optional(v.string()),
    after: v.optional(v.number()),
    before: v.optional(v.number()),
    hasAttachments: v.optional(v.boolean()),
    unread: v.optional(v.boolean()),
    flagged: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const accountPublicIds = new Set(args.accountPublicIds ?? [])
    const accountIds = new Set<Id<"mailAccounts">>()
    if (accountPublicIds.size > 0) {
      const accounts = await ctx.db
        .query("mailAccounts")
        .withIndex("by_user", (queryBuilder) =>
          queryBuilder.eq("userId", args.userId)
        )
        .collect()
      for (const account of accounts) {
        if (
          account.deletedAt === undefined &&
          accountPublicIds.has(account.publicId)
        ) {
          accountIds.add(account._id)
        }
      }
    }

    const onlyAccountId = accountIds.size === 1 ? [...accountIds][0] : undefined
    const searchPlan = getMailTextSearchPlan(args)
    const searchIndexFilters = getMailSearchIndexEqualityFilters({
      accountId: onlyAccountId,
      hasAttachments: args.hasAttachments,
      unread: args.unread,
      flagged: args.flagged,
    })
    const path = args.searchMode ? undefined : args.path
    const specialUse = args.searchMode ? undefined : args.specialUse
    const customFolders = args.searchMode ? undefined : args.customFolders
    const regularEntriesQuery =
      onlyAccountId && path && args.unread
        ? ctx.db
            .query("mailListEntries")
            .withIndex("by_user_account_path_seen_sort", (queryBuilder) =>
              queryBuilder
                .eq("userId", args.userId)
                .eq("accountId", onlyAccountId)
                .eq("mailboxPath", path)
                .eq("seen", false)
            )
        : onlyAccountId && path
          ? ctx.db
              .query("mailListEntries")
              .withIndex("by_user_account_path_sort", (queryBuilder) =>
                queryBuilder
                  .eq("userId", args.userId)
                  .eq("accountId", onlyAccountId)
                  .eq("mailboxPath", path)
              )
          : onlyAccountId && specialUse && args.unread
            ? ctx.db
                .query("mailListEntries")
                .withIndex(
                  "by_user_account_special_use_seen_sort",
                  (queryBuilder) =>
                    queryBuilder
                      .eq("userId", args.userId)
                      .eq("accountId", onlyAccountId)
                      .eq("mailboxSpecialUse", specialUse)
                      .eq("seen", false)
                )
            : onlyAccountId && specialUse
              ? ctx.db
                  .query("mailListEntries")
                  .withIndex(
                    "by_user_account_special_use_sort",
                    (queryBuilder) =>
                      queryBuilder
                        .eq("userId", args.userId)
                        .eq("accountId", onlyAccountId)
                        .eq("mailboxSpecialUse", specialUse)
                  )
              : customFolders && args.unread
                ? ctx.db
                    .query("mailListEntries")
                    .withIndex(
                      "by_user_special_use_seen_sort",
                      (queryBuilder) =>
                        queryBuilder
                          .eq("userId", args.userId)
                          .eq("mailboxSpecialUse", undefined)
                          .eq("seen", false)
                    )
                : customFolders
                  ? ctx.db
                      .query("mailListEntries")
                      .withIndex("by_user_special_use_sort", (queryBuilder) =>
                        queryBuilder
                          .eq("userId", args.userId)
                          .eq("mailboxSpecialUse", undefined)
                      )
                  : specialUse && args.unread
                    ? ctx.db
                        .query("mailListEntries")
                        .withIndex(
                          "by_user_special_use_seen_sort",
                          (queryBuilder) =>
                            queryBuilder
                              .eq("userId", args.userId)
                              .eq("mailboxSpecialUse", specialUse)
                              .eq("seen", false)
                        )
                    : specialUse
                      ? ctx.db
                          .query("mailListEntries")
                          .withIndex(
                            "by_user_special_use_sort",
                            (queryBuilder) =>
                              queryBuilder
                                .eq("userId", args.userId)
                                .eq("mailboxSpecialUse", specialUse)
                          )
                      : args.unread
                        ? ctx.db
                            .query("mailListEntries")
                            .withIndex("by_user_seen_sort", (queryBuilder) =>
                              queryBuilder
                                .eq("userId", args.userId)
                                .eq("seen", false)
                            )
                        : ctx.db
                            .query("mailListEntries")
                            .withIndex("by_user_sort", (queryBuilder) =>
                              queryBuilder.eq("userId", args.userId)
                            )

    let entriesQuery =
      searchPlan?.field === "all"
        ? ctx.db
            .query("mailListEntries")
            .withSearchIndex("search_all_v2", (queryBuilder) => {
              let searched = queryBuilder
                .search("searchText", searchPlan.query)
                .eq("userId", args.userId)
                .eq("visible", searchIndexFilters.visible)
              if (searchIndexFilters.accountId) {
                searched = searched.eq(
                  "accountId",
                  searchIndexFilters.accountId
                )
              }
              if (searchIndexFilters.hasAttachments !== undefined) {
                searched = searched.eq(
                  "hasAttachments",
                  searchIndexFilters.hasAttachments
                )
              }
              if (searchIndexFilters.flagged !== undefined) {
                searched = searched.eq("flagged", searchIndexFilters.flagged)
              }
              if (searchIndexFilters.seen !== undefined) {
                searched = searched.eq("seen", searchIndexFilters.seen)
              }
              return searched
            })
        : searchPlan?.field === "subject"
          ? ctx.db
              .query("mailListEntries")
              .withSearchIndex("search_subject_v2", (queryBuilder) => {
                let searched = queryBuilder
                  .search("subjectSearch", searchPlan.query)
                  .eq("userId", args.userId)
                  .eq("visible", searchIndexFilters.visible)
                if (searchIndexFilters.accountId) {
                  searched = searched.eq(
                    "accountId",
                    searchIndexFilters.accountId
                  )
                }
                if (searchIndexFilters.hasAttachments !== undefined) {
                  searched = searched.eq(
                    "hasAttachments",
                    searchIndexFilters.hasAttachments
                  )
                }
                if (searchIndexFilters.flagged !== undefined) {
                  searched = searched.eq("flagged", searchIndexFilters.flagged)
                }
                if (searchIndexFilters.seen !== undefined) {
                  searched = searched.eq("seen", searchIndexFilters.seen)
                }
                return searched
              })
          : searchPlan?.field === "from"
            ? ctx.db
                .query("mailListEntries")
                .withSearchIndex("search_from_v2", (queryBuilder) => {
                  let searched = queryBuilder
                    .search("fromSearch", searchPlan.query)
                    .eq("userId", args.userId)
                    .eq("visible", searchIndexFilters.visible)
                  if (searchIndexFilters.accountId) {
                    searched = searched.eq(
                      "accountId",
                      searchIndexFilters.accountId
                    )
                  }
                  if (searchIndexFilters.hasAttachments !== undefined) {
                    searched = searched.eq(
                      "hasAttachments",
                      searchIndexFilters.hasAttachments
                    )
                  }
                  if (searchIndexFilters.flagged !== undefined) {
                    searched = searched.eq(
                      "flagged",
                      searchIndexFilters.flagged
                    )
                  }
                  if (searchIndexFilters.seen !== undefined) {
                    searched = searched.eq("seen", searchIndexFilters.seen)
                  }
                  return searched
                })
            : searchPlan?.field === "to"
              ? ctx.db
                  .query("mailListEntries")
                  .withSearchIndex("search_to_v2", (queryBuilder) => {
                    let searched = queryBuilder
                      .search("toSearch", searchPlan.query)
                      .eq("userId", args.userId)
                      .eq("visible", searchIndexFilters.visible)
                    if (searchIndexFilters.accountId) {
                      searched = searched.eq(
                        "accountId",
                        searchIndexFilters.accountId
                      )
                    }
                    if (searchIndexFilters.hasAttachments !== undefined) {
                      searched = searched.eq(
                        "hasAttachments",
                        searchIndexFilters.hasAttachments
                      )
                    }
                    if (searchIndexFilters.flagged !== undefined) {
                      searched = searched.eq(
                        "flagged",
                        searchIndexFilters.flagged
                      )
                    }
                    if (searchIndexFilters.seen !== undefined) {
                      searched = searched.eq("seen", searchIndexFilters.seen)
                    }
                    return searched
                  })
              : regularEntriesQuery.order("desc")

    if (!searchPlan) {
      entriesQuery = entriesQuery.filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("visible"), true)
      )
    }
    if (accountPublicIds.size > 0 && accountIds.size === 0) {
      entriesQuery = entriesQuery.filter((queryBuilder) =>
        queryBuilder.neq(queryBuilder.field("userId"), args.userId)
      )
    } else if (accountIds.size > 0) {
      entriesQuery = entriesQuery.filter((queryBuilder) =>
        queryBuilder.or(
          ...[...accountIds].map((accountId) =>
            queryBuilder.eq(queryBuilder.field("accountId"), accountId)
          )
        )
      )
    }
    if (path) {
      entriesQuery = entriesQuery.filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("mailboxPath"), path)
      )
    }
    if (customFolders) {
      entriesQuery = entriesQuery.filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("mailboxSpecialUse"), undefined)
      )
    }
    if (args.after !== undefined) {
      entriesQuery = entriesQuery.filter((queryBuilder) =>
        queryBuilder.gte(queryBuilder.field("sortAt"), args.after!)
      )
    }
    if (args.before !== undefined) {
      entriesQuery = entriesQuery.filter((queryBuilder) =>
        queryBuilder.lt(queryBuilder.field("sortAt"), args.before!)
      )
    }
    if (!searchPlan && args.hasAttachments !== undefined) {
      entriesQuery = entriesQuery.filter((queryBuilder) =>
        queryBuilder.eq(
          queryBuilder.field("hasAttachments"),
          args.hasAttachments!
        )
      )
    }
    if (!searchPlan && args.flagged) {
      entriesQuery = entriesQuery.filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("flagged"), true)
      )
    }
    if (!searchPlan && args.unread) {
      entriesQuery = entriesQuery.filter((queryBuilder) =>
        queryBuilder.eq(queryBuilder.field("seen"), false)
      )
    }

    const page = await entriesQuery.paginate(args.paginationOpts)
    const filtered = page.page.filter((entry) =>
      matchesSecondaryMailTextCriteria(entry, args, searchPlan?.field ?? null)
    )

    return {
      ...page,
      page: await Promise.all(filtered.map((entry) => toListItem(ctx, entry))),
    }
  },
})

export const getMessage = internalQuery({
  args: {
    userId: v.id("users"),
    messagePublicId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await findOwnedMessage(
      ctx,
      args.userId,
      args.messagePublicId
    )
    return message ? await toMessageDto(ctx, message) : null
  },
})

export const getMessages = internalQuery({
  args: {
    userId: v.id("users"),
    messagePublicIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const messages = await Promise.all(
      args.messagePublicIds.map((publicId) =>
        findOwnedMessage(ctx, args.userId, publicId)
      )
    )
    return await Promise.all(
      messages.flatMap((message) =>
        message ? [toMessageDto(ctx, message)] : []
      )
    )
  },
})

export const getThread = internalQuery({
  args: {
    userId: v.id("users"),
    messagePublicId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await findOwnedMessage(
      ctx,
      args.userId,
      args.messagePublicId
    )
    if (!message) return null

    const thread = await ctx.db.get(message.threadId)
    const account = await ctx.db.get(message.accountId)
    if (!thread || !account) return null

    const messages = await ctx.db
      .query("mailMessages")
      .withIndex("by_thread_received", (queryBuilder) =>
        queryBuilder.eq("threadId", thread._id)
      )
      .order("asc")
      .collect()
    const visible = messages.filter(
      (candidate) =>
        candidate.userId === args.userId && candidate.deletedAt === undefined
    )
    return {
      id: thread.publicId,
      accountId: account.publicId,
      subject: thread.subject ?? null,
      messageCount: visible.length,
      messages: await Promise.all(
        visible.map((candidate) => toThreadItem(ctx, candidate))
      ),
    }
  },
})

export const getAttachment = internalQuery({
  args: {
    userId: v.id("users"),
    messagePublicId: v.optional(v.string()),
    attachmentPublicId: v.string(),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db
      .query("mailAttachments")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.attachmentPublicId)
      )
      .unique()
    if (!attachment) return null

    const message = await ctx.db.get(attachment.messageId)
    if (
      !message ||
      message.userId !== args.userId ||
      message.deletedAt !== undefined ||
      (args.messagePublicId !== undefined &&
        message.publicId !== args.messagePublicId)
    ) {
      return null
    }

    const location = await firstMessageLocation(ctx, message._id)
    const mailbox = location ? await ctx.db.get(location.mailboxId) : null
    const account = await ctx.db.get(message.accountId)
    return account && mailbox && location
      ? {
          attachment,
          message,
          mailbox,
          location,
          account,
        }
      : null
  },
})

export const getMessageProviderData = internalQuery({
  args: {
    userId: v.id("users"),
    messagePublicId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await findOwnedMessage(
      ctx,
      args.userId,
      args.messagePublicId
    )
    if (!message) return null

    const location = await firstMessageLocation(ctx, message._id)
    const mailbox = location ? await ctx.db.get(location.mailboxId) : null
    const account = await ctx.db.get(message.accountId)
    return account && mailbox && location
      ? { message, mailbox, location, account }
      : null
  },
})

export const hydrateMessage = internalMutation({
  args: {
    userId: v.id("users"),
    messagePublicId: v.string(),
    textBody: v.optional(v.string()),
    htmlBody: v.optional(v.string()),
    attachments: v.array(attachmentInput),
  },
  handler: async (ctx, args) => {
    const message = await findOwnedMessage(
      ctx,
      args.userId,
      args.messagePublicId
    )
    if (!message) return null

    const now = Date.now()
    await upsertBody(
      ctx,
      message._id,
      {
        textBody: args.textBody,
        htmlBody: args.htmlBody,
      },
      now
    )
    await upsertAttachments(ctx, message._id, args.attachments, now)
    await ctx.db.patch(message._id, {
      bodyStatus: "loaded",
      hasAttachments: args.attachments.length > 0,
      updatedAt: now,
    })
    const entries = await ctx.db
      .query("mailListEntries")
      .withIndex("by_message", (queryBuilder) =>
        queryBuilder.eq("messageId", message._id)
      )
      .collect()
    for (const entry of entries) {
      await ctx.db.patch(entry._id, {
        bodyStatus: "loaded",
        hasAttachments: args.attachments.length > 0,
        updatedAt: now,
      })
    }

    const updated = await ctx.db.get(message._id)
    return updated ? await toMessageDto(ctx, updated) : null
  },
})

export const updateFlags = internalMutation({
  args: {
    userId: v.id("users"),
    messagePublicId: v.string(),
    clientMutationId: v.string(),
    seen: v.optional(v.boolean()),
    flagged: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const message = await applyOwnedMessageFlags(ctx, args)
    if (!message) return null

    return await toMessageDto(ctx, message)
  },
})

export async function applyOwnedMessageFlags(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">
    messagePublicId: string
    clientMutationId: string
    seen?: boolean
    flagged?: boolean
  }
) {
  const message = await findOwnedMessage(ctx, args.userId, args.messagePublicId)
  if (!message) return null

  const existingOperation = await ctx.db
    .query("mailProviderOperations")
    .withIndex("by_client_request", (queryBuilder) =>
      queryBuilder.eq("clientMutationId", args.clientMutationId)
    )
    .unique()
  if (existingOperation) {
    return await ctx.db.get(message._id)
  }

  const version = message.flagsVersion + 1
  const nextFlags = {
    ...message.flags,
    ...(args.seen === undefined ? {} : { seen: args.seen }),
    ...(args.flagged === undefined ? {} : { flagged: args.flagged }),
  }
  const now = Date.now()
  await ctx.db.patch(message._id, {
    flags: nextFlags,
    flagsVersion: version,
    updatedAt: now,
  })
  await synchronizeMessageListEntryFlags(ctx, message._id, nextFlags, now)
  await ctx.db.insert("mailProviderOperations", {
    publicId: args.clientMutationId,
    messageId: message._id,
    accountId: message.accountId,
    clientMutationId: args.clientMutationId,
    messageVersionKey: `${message._id}:${version}`,
    operation: "update_flags",
    desiredFlags: {
      seen: args.seen,
      flagged: args.flagged,
    },
    version,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  })

  return await ctx.db.get(message._id)
}

export const moveMessage = internalMutation({
  args: {
    userId: v.id("users"),
    messagePublicId: v.string(),
    destinationPath: v.string(),
    clientMutationId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await findOwnedMessage(
      ctx,
      args.userId,
      args.messagePublicId
    )
    if (!message) return null

    const mailboxes = await ctx.db
      .query("mailboxes")
      .withIndex("by_account", (queryBuilder) =>
        queryBuilder.eq("accountId", message.accountId)
      )
      .collect()
    const destination = mailboxes.find(
      (mailbox) =>
        mailbox.deletedAt === undefined && mailbox.path === args.destinationPath
    )
    const sourceLocation = await firstMessageLocation(ctx, message._id)
    if (!destination || !sourceLocation) return null

    const existingOperation = await ctx.db
      .query("mailProviderOperations")
      .withIndex("by_client_request", (queryBuilder) =>
        queryBuilder.eq("clientMutationId", args.clientMutationId)
      )
      .unique()
    if (!existingOperation) {
      const version = message.flagsVersion + 1
      const now = Date.now()
      await ctx.db.insert("mailProviderOperations", {
        publicId: args.clientMutationId,
        messageId: message._id,
        accountId: message.accountId,
        clientMutationId: args.clientMutationId,
        messageVersionKey: `${message._id}:${version}`,
        operation: "move",
        destinationMailboxId: destination._id,
        version,
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.patch(message._id, {
        flagsVersion: version,
        updatedAt: now,
      })
      await ctx.db.patch(sourceLocation._id, {
        mailboxId: destination._id,
        mailboxUidKey: `${destination._id}:${sourceLocation.uidValidity ?? ""}:${sourceLocation.uid ?? ""}`,
      })
      const entries = await ctx.db
        .query("mailListEntries")
        .withIndex("by_message", (queryBuilder) =>
          queryBuilder.eq("messageId", message._id)
        )
        .collect()
      const countDeltas = new Map<
        Id<"mailboxes">,
        { total: number; unread: number }
      >()
      for (const entry of entries) {
        if (entry.visible && entry.mailboxId !== destination._id) {
          addMailboxCountDelta(
            countDeltas,
            entry.mailboxId,
            -1,
            entry.seen ? 0 : -1
          )
          addMailboxCountDelta(
            countDeltas,
            destination._id,
            1,
            entry.seen ? 0 : 1
          )
        }
        await ctx.db.patch(entry._id, {
          mailboxId: destination._id,
          mailboxPath: destination.path,
          mailboxSpecialUse: destination.specialUse,
          entryKey: `${destination._id}:${message._id}`,
          updatedAt: now,
        })
      }
      await applyMailboxCountDeltas(ctx, countDeltas, now)
    }

    const updated = await ctx.db.get(message._id)
    return updated ? await toMessageDto(ctx, updated) : null
  },
})

export const getProviderOperationWakeState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [pending, retry, processing] = await Promise.all([
      ctx.db
        .query("mailProviderOperations")
        .withIndex("by_status_attempt", (queryBuilder) =>
          queryBuilder.eq("status", "pending")
        )
        .order("asc")
        .first(),
      ctx.db
        .query("mailProviderOperations")
        .withIndex("by_status_attempt", (queryBuilder) =>
          queryBuilder.eq("status", "retry")
        )
        .order("asc")
        .first(),
      ctx.db
        .query("mailProviderOperations")
        .withIndex("by_status_locked", (queryBuilder) =>
          queryBuilder.eq("status", "processing")
        )
        .order("asc")
        .first(),
    ])
    const nextAttemptAt = [pending?.nextAttemptAt, retry?.nextAttemptAt].filter(
      (value): value is number => value !== undefined
    )

    return {
      nextAttemptAt:
        nextAttemptAt.length > 0 ? Math.min(...nextAttemptAt) : null,
      lockedAt: processing?.lockedAt ?? null,
    }
  },
})

export const claimProviderOperations = internalMutation({
  args: {
    limit: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("mailProviderOperations")
      .withIndex("by_status_attempt", (queryBuilder) =>
        queryBuilder.eq("status", "pending").lte("nextAttemptAt", args.now)
      )
      .take(args.limit)
    const retry = await ctx.db
      .query("mailProviderOperations")
      .withIndex("by_status_attempt", (queryBuilder) =>
        queryBuilder.eq("status", "retry").lte("nextAttemptAt", args.now)
      )
      .take(Math.max(0, args.limit - pending.length))
    const abandoned = await ctx.db
      .query("mailProviderOperations")
      .withIndex("by_status_locked", (queryBuilder) =>
        queryBuilder
          .eq("status", "processing")
          .lte("lockedAt", args.now - 5 * 60 * 1000)
      )
      .take(Math.max(0, args.limit - pending.length - retry.length))
    const operations = [...pending, ...retry, ...abandoned]

    for (const operation of operations) {
      await ctx.db.patch(operation._id, {
        status: "processing",
        attempts: operation.attempts + 1,
        lockedAt: args.now,
        updatedAt: args.now,
      })
    }

    return await Promise.all(
      operations.map(async (operation) => {
        const [message, account, destinationMailbox] = await Promise.all([
          ctx.db.get(operation.messageId),
          ctx.db.get(operation.accountId),
          operation.destinationMailboxId
            ? ctx.db.get(operation.destinationMailboxId)
            : null,
        ])
        const location = message
          ? await firstMessageLocation(ctx, message._id)
          : null
        const mailbox = location ? await ctx.db.get(location.mailboxId) : null
        return {
          operation: {
            ...operation,
            status: "processing" as const,
            attempts: operation.attempts + 1,
            lockedAt: args.now,
          },
          message,
          account,
          location,
          mailbox,
          destinationMailbox,
        }
      })
    )
  },
})

export const finishProviderOperation = internalMutation({
  args: {
    operationId: v.id("mailProviderOperations"),
    status: v.union(
      v.literal("succeeded"),
      v.literal("retry"),
      v.literal("failed"),
      v.literal("superseded")
    ),
    nextAttemptAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    await finishProviderOperationRecord(ctx, args)
  },
})

export const finishProviderOperations = internalMutation({
  args: {
    updates: v.array(
      v.object({
        operationId: v.id("mailProviderOperations"),
        status: v.union(
          v.literal("succeeded"),
          v.literal("retry"),
          v.literal("failed"),
          v.literal("superseded")
        ),
        nextAttemptAt: v.optional(v.number()),
        lastError: v.optional(v.string()),
      })
    ),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    for (const update of args.updates) {
      await finishProviderOperationRecord(ctx, {
        ...update,
        now: args.now,
      })
    }
  },
})

async function finishProviderOperationRecord(
  ctx: MutationCtx,
  args: {
    operationId: Id<"mailProviderOperations">
    status: "succeeded" | "retry" | "failed" | "superseded"
    nextAttemptAt?: number
    lastError?: string
    now: number
  }
) {
  const operation = await ctx.db.get(args.operationId)
  if (!operation) return

  await ctx.db.patch(operation._id, {
    status: args.status,
    nextAttemptAt: args.nextAttemptAt ?? operation.nextAttemptAt,
    lastError: args.lastError,
    processedAt: args.status === "retry" ? undefined : args.now,
    lockedAt: undefined,
    updatedAt: args.now,
  })

  if (args.status === "succeeded") {
    const message = await ctx.db.get(operation.messageId)
    if (message && message.flagsVersion === operation.version) {
      await ctx.db.patch(message._id, {
        providerFlags: message.flags,
        providerFlagsVersion: operation.version,
        updatedAt: args.now,
      })
    }
  }
}

async function upsertMessage(
  ctx: MutationCtx,
  account: Doc<"mailAccounts">,
  mailbox: Doc<"mailboxes">,
  input: typeof messageInput.type,
  emitPushEvents: boolean
) {
  const now = Date.now()
  const accountMessageKey = `${account._id}:${input.messageKey}`
  let message = await ctx.db
    .query("mailMessages")
    .withIndex("by_account_message_key", (queryBuilder) =>
      queryBuilder.eq("accountMessageKey", accountMessageKey)
    )
    .unique()
  const isNew = !message
  const preserveLocalFlags = Boolean(
    message && message.flagsVersion > message.providerFlagsVersion
  )
  const listFlags = preserveLocalFlags && message ? message.flags : input.flags
  const thread = await upsertThread(ctx, account, input)
  const sortAt = input.receivedAt ?? input.sentAt ?? now

  if (message) {
    await ctx.db.patch(message._id, {
      threadId: thread._id,
      internetMessageId: input.internetMessageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
      subject: input.subject,
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      sentAt: input.sentAt,
      receivedAt: input.receivedAt,
      sortAt,
      snippet: input.snippet,
      providerFlags: input.flags,
      flags:
        message.flagsVersion > message.providerFlagsVersion
          ? message.flags
          : input.flags,
      providerFlagsVersion: preserveLocalFlags
        ? message.providerFlagsVersion
        : message.flagsVersion,
      labels: input.labels,
      hasAttachments: input.hasAttachments,
      bodyStatus:
        input.textBody !== undefined || input.htmlBody !== undefined
          ? "loaded"
          : message.bodyStatus,
      deletedAt: undefined,
      updatedAt: now,
    })
    message = await ctx.db.get(message._id)
  } else {
    const messageId = await ctx.db.insert("mailMessages", {
      publicId: input.publicId,
      userId: account.userId,
      accountId: account._id,
      threadId: thread._id,
      accountMessageKey,
      accountProviderId: `${account._id}:${input.emailengineMessageId}`,
      messageKey: input.messageKey,
      emailengineMessageId: input.emailengineMessageId,
      internetMessageId: input.internetMessageId,
      inReplyTo: input.inReplyTo,
      references: input.references,
      threadHeadersLoaded: true,
      subject: input.subject,
      from: input.from,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      sentAt: input.sentAt,
      receivedAt: input.receivedAt,
      sortAt,
      snippet: input.snippet,
      flags: input.flags,
      providerFlags: input.flags,
      flagsVersion: 0,
      providerFlagsVersion: 0,
      labels: input.labels,
      hasAttachments: input.hasAttachments,
      bodyStatus:
        input.textBody !== undefined || input.htmlBody !== undefined
          ? "loaded"
          : "not_loaded",
      createdAt: now,
      updatedAt: now,
    })
    message = await ctx.db.get(messageId)
  }

  if (!message) {
    return { newInboxMessage: false, totalDelta: 0, unreadDelta: 0 }
  }

  await upsertLocation(ctx, message, mailbox, input, now)
  await upsertBody(ctx, message._id, input, now)
  await upsertAttachments(ctx, message._id, input.attachments, now)
  const listEntryDelta = await upsertListEntry(
    ctx,
    account,
    mailbox,
    message,
    listFlags,
    now
  )
  await refreshThread(ctx, thread._id)

  const newInboxMessage =
    isNew && mailbox.specialUse?.toLocaleLowerCase() === "\\inbox"
  if (newInboxMessage && emitPushEvents) {
    const eventKey = `mail:new:${message.publicId}`
    const existingEvent = await ctx.db
      .query("pushEvents")
      .withIndex("by_event_key", (queryBuilder) =>
        queryBuilder.eq("eventKey", eventKey)
      )
      .unique()
    if (!existingEvent) {
      await ctx.db.insert("pushEvents", {
        eventKey,
        userId: account.userId,
        accountId: account._id,
        messageId: message._id,
        type: "mail:new",
        payload: {
          id: message.publicId,
          subject: message.subject ?? null,
          from: message.from ?? null,
          snippet: message.snippet ?? null,
          date: new Date(message.sortAt).toISOString(),
        },
        status: "pending",
        attempts: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  return {
    newInboxMessage,
    ...listEntryDelta,
  }
}

async function upsertThread(
  ctx: MutationCtx,
  account: Doc<"mailAccounts">,
  input: typeof messageInput.type
) {
  const accountThreadKey = `${account._id}:${input.computedThreadKey}`
  const existing = await ctx.db
    .query("mailThreads")
    .withIndex("by_account_thread_key", (queryBuilder) =>
      queryBuilder.eq("accountThreadKey", accountThreadKey)
    )
    .unique()
  const now = Date.now()
  if (existing) {
    await ctx.db.patch(existing._id, {
      providerThreadId: input.computedThreadKey.startsWith("provider:")
        ? input.computedThreadKey.slice("provider:".length)
        : existing.providerThreadId,
      subject: input.subject ?? existing.subject,
      lastMessageAt: Math.max(
        existing.lastMessageAt ?? 0,
        input.receivedAt ?? input.sentAt ?? now
      ),
      participants: uniqueAddresses([
        ...(input.from ? [input.from] : []),
        ...input.to,
        ...input.cc,
      ]),
      snippet: input.snippet ?? existing.snippet,
      hasAttachments: existing.hasAttachments || input.hasAttachments,
      updatedAt: now,
    })
    return (await ctx.db.get(existing._id))!
  }

  const id = await ctx.db.insert("mailThreads", {
    publicId: crypto.randomUUID(),
    accountId: account._id,
    accountThreadKey,
    providerThreadId: input.computedThreadKey.startsWith("provider:")
      ? input.computedThreadKey.slice("provider:".length)
      : undefined,
    computedThreadKey: input.computedThreadKey,
    subject: input.subject,
    lastMessageAt: input.receivedAt ?? input.sentAt ?? now,
    participants: uniqueAddresses([
      ...(input.from ? [input.from] : []),
      ...input.to,
      ...input.cc,
    ]),
    snippet: input.snippet,
    messageCount: 0,
    hasAttachments: input.hasAttachments,
    isConversation: false,
    createdAt: now,
    updatedAt: now,
  })
  return (await ctx.db.get(id))!
}

async function refreshThread(ctx: MutationCtx, threadId: Id<"mailThreads">) {
  const messages = await ctx.db
    .query("mailMessages")
    .withIndex("by_thread_received", (queryBuilder) =>
      queryBuilder.eq("threadId", threadId)
    )
    .collect()
  const active = messages.filter((message) => message.deletedAt === undefined)
  const latest = active.reduce<Doc<"mailMessages"> | null>(
    (current, message) =>
      !current || message.sortAt > current.sortAt ? message : current,
    null
  )
  await ctx.db.patch(threadId, {
    messageCount: active.length,
    isConversation: active.length > 1,
    hasAttachments: active.some((message) => message.hasAttachments),
    lastMessageAt: latest?.sortAt,
    snippet: latest?.snippet,
    updatedAt: Date.now(),
  })
}

async function upsertLocation(
  ctx: MutationCtx,
  message: Doc<"mailMessages">,
  mailbox: Doc<"mailboxes">,
  input: typeof messageInput.type,
  now: number
) {
  const mailboxUidKey = `${mailbox._id}:${input.uidValidity ?? ""}:${input.uid}`
  const byUid = await ctx.db
    .query("mailMessageLocations")
    .withIndex("by_mailbox_uid_key", (queryBuilder) =>
      queryBuilder.eq("mailboxUidKey", mailboxUidKey)
    )
    .unique()
  if (byUid) {
    await ctx.db.patch(byUid._id, {
      messageId: message._id,
      mailboxId: mailbox._id,
    })
    return
  }

  const locations = await ctx.db
    .query("mailMessageLocations")
    .withIndex("by_message", (queryBuilder) =>
      queryBuilder.eq("messageId", message._id)
    )
    .collect()
  const existing = locations.find(
    (location) => location.mailboxId === mailbox._id
  )
  if (existing) {
    await ctx.db.patch(existing._id, {
      mailboxUidKey,
      uid: input.uid,
      uidValidity: input.uidValidity,
    })
  } else {
    await ctx.db.insert("mailMessageLocations", {
      messageId: message._id,
      mailboxId: mailbox._id,
      mailboxUidKey,
      uid: input.uid,
      uidValidity: input.uidValidity,
      createdAt: now,
    })
  }
}

async function upsertBody(
  ctx: MutationCtx,
  messageId: Id<"mailMessages">,
  input: {
    textBody?: string
    htmlBody?: string
  },
  now: number
) {
  if (input.textBody === undefined && input.htmlBody === undefined) return

  const body = await ctx.db
    .query("mailMessageBodies")
    .withIndex("by_message", (queryBuilder) =>
      queryBuilder.eq("messageId", messageId)
    )
    .unique()
  if (body) {
    await ctx.db.patch(body._id, {
      textBody: input.textBody,
      htmlBody: input.htmlBody,
      updatedAt: now,
    })
  } else {
    await ctx.db.insert("mailMessageBodies", {
      messageId,
      textBody: input.textBody,
      htmlBody: input.htmlBody,
      createdAt: now,
      updatedAt: now,
    })
  }
}

async function upsertAttachments(
  ctx: MutationCtx,
  messageId: Id<"mailMessages">,
  attachments: Array<typeof attachmentInput.type>,
  now: number
) {
  for (const input of attachments) {
    const messagePartKey = `${messageId}:${input.partId ?? input.emailengineAttachmentId}`
    const existing = await ctx.db
      .query("mailAttachments")
      .withIndex("by_message_part_key", (queryBuilder) =>
        queryBuilder.eq("messagePartKey", messagePartKey)
      )
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        partId: input.partId,
        emailengineAttachmentId: input.emailengineAttachmentId,
        filename: input.filename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        contentId: input.contentId,
        isInline: input.isInline,
      })
    } else {
      await ctx.db.insert("mailAttachments", {
        messageId,
        messagePartKey,
        ...input,
        createdAt: now,
      })
    }
  }
}

async function upsertListEntry(
  ctx: MutationCtx,
  account: Doc<"mailAccounts">,
  mailbox: Doc<"mailboxes">,
  message: Doc<"mailMessages">,
  flags: typeof messageFlags.type,
  now: number
) {
  const entryKey = `${mailbox._id}:${message._id}`
  const existing = await ctx.db
    .query("mailListEntries")
    .withIndex("by_entry_key", (queryBuilder) =>
      queryBuilder.eq("entryKey", entryKey)
    )
    .unique()
  await synchronizeMessageListEntryFlags(ctx, message._id, flags, now)
  const fields = {
    userId: account.userId,
    accountId: account._id,
    accountPublicId: account.publicId,
    mailboxId: mailbox._id,
    messageId: message._id,
    messagePublicId: message.publicId,
    threadId: message.threadId,
    entryKey,
    mailboxPath: mailbox.path,
    mailboxSpecialUse: mailbox.specialUse,
    sortAt: message.sortAt,
    sentAt: message.sentAt,
    subject: message.subject,
    from: message.from,
    to: message.to,
    snippet: message.snippet,
    seen: flags.seen,
    flagged: flags.flagged,
    hasAttachments: message.hasAttachments,
    bodyStatus: message.bodyStatus,
    searchText: [
      message.subject,
      message.snippet,
      message.from?.address,
      message.from?.name,
      ...message.to.flatMap((address) => [address.address, address.name]),
    ]
      .filter(Boolean)
      .join(" "),
    fromSearch: [message.from?.address, message.from?.name]
      .filter(Boolean)
      .join(" "),
    toSearch: message.to
      .flatMap((address) => [address.address, address.name])
      .filter(Boolean)
      .join(" "),
    subjectSearch: message.subject ?? "",
    visible: true,
    openCount: 0,
    clickCount: 0,
    updatedAt: now,
  }
  if (existing) {
    await ctx.db.patch(existing._id, fields)
    return {
      totalDelta: existing.visible ? 0 : 1,
      unreadDelta: existing.visible || flags.seen ? 0 : 1,
    }
  } else {
    await ctx.db.insert("mailListEntries", fields)
    return {
      totalDelta: 1,
      unreadDelta: flags.seen ? 0 : 1,
    }
  }
}

function addMailboxCountDelta(
  deltas: Map<Id<"mailboxes">, { total: number; unread: number }>,
  mailboxId: Id<"mailboxes">,
  total: number,
  unread: number
) {
  const current = deltas.get(mailboxId) ?? { total: 0, unread: 0 }
  deltas.set(mailboxId, {
    total: current.total + total,
    unread: current.unread + unread,
  })
}

async function findActiveMailboxByPath(
  ctx: MutationCtx,
  accountId: Id<"mailAccounts">,
  mailboxPath: string
) {
  const mailboxes = await ctx.db
    .query("mailboxes")
    .withIndex("by_account", (queryBuilder) =>
      queryBuilder.eq("accountId", accountId)
    )
    .collect()
  return (
    mailboxes.find(
      (mailbox) =>
        mailbox.deletedAt === undefined && mailbox.path === mailboxPath
    ) ?? null
  )
}

async function applyProviderFlags(
  ctx: MutationCtx,
  mailbox: Doc<"mailboxes">,
  state: {
    uid: string
    flags: typeof messageFlags.type
    modseq?: string
  }
) {
  const mailboxUidKey = `${mailbox._id}:${mailbox.uidValidity ?? ""}:${state.uid}`
  const location = await ctx.db
    .query("mailMessageLocations")
    .withIndex("by_mailbox_uid_key", (queryBuilder) =>
      queryBuilder.eq("mailboxUidKey", mailboxUidKey)
    )
    .unique()
  const message = location ? await ctx.db.get(location.messageId) : null
  if (!message || message.deletedAt !== undefined) return false

  const preserveLocalFlags = message.flagsVersion > message.providerFlagsVersion
  const now = Date.now()
  await ctx.db.patch(message._id, {
    providerFlags: state.flags,
    flags: preserveLocalFlags ? message.flags : state.flags,
    providerFlagsVersion: preserveLocalFlags
      ? message.providerFlagsVersion
      : message.flagsVersion,
    updatedAt: now,
  })
  if (!preserveLocalFlags) {
    await synchronizeMessageListEntryFlags(ctx, message._id, state.flags, now)
  }
  if (state.modseq !== undefined) {
    await ctx.db.patch(mailbox._id, {
      liveModseqCursor: maxModseq(mailbox.liveModseqCursor, state.modseq),
      updatedAt: now,
    })
  }
  return true
}

function maxModseq(first: string | undefined, second: string) {
  if (first === undefined) return second
  try {
    return BigInt(second) > BigInt(first) ? second : first
  } catch {
    return second
  }
}

async function applyMailboxCountDeltas(
  ctx: MutationCtx,
  deltas: Map<Id<"mailboxes">, { total: number; unread: number }>,
  now: number
) {
  for (const [mailboxId, delta] of deltas) {
    await applyMailboxCountDelta(ctx, mailboxId, delta, now)
  }
}

async function findOwnedAccount(
  ctx: QueryCtx,
  userId: Id<"users">,
  publicId: string
) {
  const account = await ctx.db
    .query("mailAccounts")
    .withIndex("by_public_id", (queryBuilder) =>
      queryBuilder.eq("publicId", publicId)
    )
    .unique()
  return account && account.userId === userId && account.deletedAt === undefined
    ? account
    : null
}

async function findOwnedMessage(
  ctx: QueryCtx,
  userId: Id<"users">,
  publicId: string
) {
  const message = await ctx.db
    .query("mailMessages")
    .withIndex("by_public_id", (queryBuilder) =>
      queryBuilder.eq("publicId", publicId)
    )
    .unique()
  return message && message.userId === userId && message.deletedAt === undefined
    ? message
    : null
}

async function firstMessageLocation(
  ctx: QueryCtx,
  messageId: Id<"mailMessages">
) {
  return await ctx.db
    .query("mailMessageLocations")
    .withIndex("by_message", (queryBuilder) =>
      queryBuilder.eq("messageId", messageId)
    )
    .first()
}

async function toMessageDto(ctx: QueryCtx, message: Doc<"mailMessages">) {
  const [account, thread, attachments, body, location] = await Promise.all([
    ctx.db.get(message.accountId),
    ctx.db.get(message.threadId),
    ctx.db
      .query("mailAttachments")
      .withIndex("by_message", (queryBuilder) =>
        queryBuilder.eq("messageId", message._id)
      )
      .collect(),
    ctx.db
      .query("mailMessageBodies")
      .withIndex("by_message", (queryBuilder) =>
        queryBuilder.eq("messageId", message._id)
      )
      .unique(),
    firstMessageLocation(ctx, message._id),
  ])
  const mailbox = location ? await ctx.db.get(location.mailboxId) : null
  return {
    id: message.publicId,
    accountId: account?.publicId ?? null,
    threadId: thread?.publicId ?? null,
    path: mailbox?.path ?? null,
    subject: message.subject ?? null,
    from: message.from ?? null,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    sentAt: toIso(message.sentAt),
    receivedAt: toIso(message.receivedAt),
    snippet: message.snippet ?? null,
    seen: message.flags.seen,
    flagged: message.flags.flagged,
    flags: message.flags,
    labels: message.labels,
    hasAttachments: message.hasAttachments,
    sizeBytes: null,
    bodyStatus: message.bodyStatus,
    text: body?.textBody ?? null,
    html: body?.htmlBody ?? null,
    attachments: attachments.map((attachment) => ({
      id: attachment.publicId,
      filename: attachment.filename ?? null,
      contentType: attachment.contentType ?? null,
      sizeBytes: attachment.sizeBytes ?? null,
      contentId: attachment.contentId ?? null,
      isInline: attachment.isInline,
    })),
    openTracking: null,
    clickTracking: null,
  }
}

async function toListItem(ctx: QueryCtx, entry: Doc<"mailListEntries">) {
  const [message, account] = await Promise.all([
    entry.messagePublicId ? null : ctx.db.get(entry.messageId),
    entry.accountPublicId ? null : ctx.db.get(entry.accountId),
  ])
  return {
    id: entry.messagePublicId ?? message?.publicId ?? "",
    accountId: entry.accountPublicId ?? account?.publicId ?? null,
    path: entry.mailboxPath,
    subject: entry.subject ?? null,
    from: entry.from ?? null,
    to: entry.to,
    sentAt: toIso(entry.sentAt ?? message?.sentAt ?? entry.sortAt),
    snippet: entry.snippet ?? null,
    seen: entry.seen,
    flagged: entry.flagged,
    hasAttachments: entry.hasAttachments,
    sizeBytes: null,
    openTracking:
      entry.openCount > 0
        ? {
            enabled: true,
            openCount: entry.openCount,
            firstOpenedAt: null,
            lastOpenedAt: null,
          }
        : null,
    clickTracking:
      entry.clickCount > 0
        ? {
            enabled: true,
            clickCount: entry.clickCount,
            firstClickedAt: null,
            lastClickedAt: null,
          }
        : null,
  }
}

async function toThreadItem(ctx: QueryCtx, message: Doc<"mailMessages">) {
  const dto = await toMessageDto(ctx, message)
  const location = await firstMessageLocation(ctx, message._id)
  const mailbox = location ? await ctx.db.get(location.mailboxId) : null
  return {
    id: dto.id,
    accountId: dto.accountId,
    path: dto.path,
    subject: dto.subject,
    from: dto.from,
    to: dto.to,
    sentAt: dto.sentAt,
    snippet: dto.snippet,
    seen: dto.seen,
    flagged: dto.flagged,
    hasAttachments: dto.hasAttachments,
    sizeBytes: dto.sizeBytes,
    openTracking: dto.openTracking,
    clickTracking: dto.clickTracking,
    mailboxName: mailbox?.name ?? null,
    mailboxSpecialUse: mailbox?.specialUse ?? null,
    isDraft: message.flags.draft,
  }
}

function createMailboxKey(
  accountId: Id<"mailAccounts">,
  path: string,
  uidValidity: string | undefined
) {
  return `${accountId}:${path}:${uidValidity ?? ""}`
}

function uniqueAddresses(addresses: Array<typeof mailAddress.type>) {
  const seen = new Set<string>()
  return addresses.filter((address) => {
    const key = address.address.toLocaleLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toIso(value: number | undefined) {
  return value === undefined ? null : new Date(value).toISOString()
}
