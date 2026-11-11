import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { getCurrentUser } from "./lib/auth"
import { applyOwnedMessageFlags } from "./mailInternal"
import {
  getMailSearchIndexEqualityFilters,
  getMailTextSearchPlan,
  matchesSecondaryMailTextCriteria,
} from "./mailSearch"

const batchMessageFlagsUpdate = v.object({
  messagePublicId: v.string(),
  clientMutationId: v.string(),
  seen: v.optional(v.boolean()),
  flagged: v.optional(v.boolean()),
})

export const updateMessageFlagsBatch = mutation({
  args: {
    updates: v.array(batchMessageFlagsUpdate),
  },
  handler: async (ctx, args) => {
    if (args.updates.length > 100) {
      throw new Error("A maximum of 100 messages can be updated at once")
    }

    const user = await getCurrentUser(ctx)
    for (const update of args.updates) {
      await applyOwnedMessageFlags(ctx, {
        userId: user._id,
        ...update,
      })
    }

    return { processed: args.updates.length }
  },
})

export const listMailboxes = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const accounts = await ctx.db
      .query("mailAccounts")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", user._id)
      )
      .collect()
    const result: Record<
      string,
      Array<{
        path: string
        name: string
        specialUse: string | null
        messagesTotal: number | null
        messagesUnread: number | null
        searchComplete: boolean
      }>
    > = {}

    for (const account of accounts) {
      if (account.deletedAt !== undefined) continue
      const mailboxes = await ctx.db
        .query("mailboxes")
        .withIndex("by_account", (queryBuilder) =>
          queryBuilder.eq("accountId", account._id)
        )
        .collect()
      result[account.publicId] = mailboxes
        .filter((mailbox) => mailbox.deletedAt === undefined)
        .map((mailbox) => ({
          path: mailbox.path,
          name: mailbox.name,
          specialUse: mailbox.specialUse ?? null,
          messagesTotal: mailbox.messagesTotal ?? null,
          messagesUnread: mailbox.messagesUnread ?? null,
          searchComplete: mailbox.syncExhaustedAt !== undefined,
        }))
    }
    return result
  },
})

export const listMessageStateChanges = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const entries = await ctx.db
      .query("mailListEntries")
      .withIndex("by_user_updated", (queryBuilder) =>
        queryBuilder.eq("userId", user._id)
      )
      .order("desc")
      .take(512)
    const states = new Map<
      string,
      {
        id: string
        seen: boolean
        flagged: boolean
        updatedAt: number
      }
    >()

    for (const entry of entries) {
      if (!entry.visible) continue
      const messagePublicId =
        entry.messagePublicId ?? (await ctx.db.get(entry.messageId))?.publicId

      if (!messagePublicId || states.has(messagePublicId)) continue
      states.set(messagePublicId, {
        id: messagePublicId,
        seen: entry.seen,
        flagged: entry.flagged,
        updatedAt: entry.updatedAt,
      })

      if (states.size === 256) break
    }

    return [...states.values()]
  },
})

export const listKnownContacts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const [accounts, messages] = await Promise.all([
      ctx.db
        .query("mailAccounts")
        .withIndex("by_user", (queryBuilder) =>
          queryBuilder.eq("userId", user._id)
        )
        .collect(),
      ctx.db
        .query("mailMessages")
        .withIndex("by_user_received", (queryBuilder) =>
          queryBuilder.eq("userId", user._id)
        )
        .order("desc")
        .take(2000),
    ])
    const ownAddresses = new Set(
      accounts
        .filter((account) => account.deletedAt === undefined)
        .map((account) => normalizeEmailAddress(account.address))
    )
    const contacts = new Map<
      string,
      {
        address: string
        name: string | null
        interactionCount: number
        outboundCount: number
        lastInteractionAt: number
      }
    >()

    for (const message of messages) {
      if (message.deletedAt !== undefined) continue

      const fromAddress = normalizeEmailAddress(message.from?.address)
      const outbound = ownAddresses.has(fromAddress)
      const messageAddresses = [
        ...(message.from ? [message.from] : []),
        ...message.to,
        ...message.cc,
        ...message.bcc,
      ]
      const seenInMessage = new Set<string>()

      for (const mailAddress of messageAddresses) {
        const normalizedAddress = normalizeEmailAddress(mailAddress.address)

        if (
          !normalizedAddress ||
          ownAddresses.has(normalizedAddress) ||
          seenInMessage.has(normalizedAddress)
        ) {
          continue
        }

        seenInMessage.add(normalizedAddress)
        const existing = contacts.get(normalizedAddress)
        const name = mailAddress.name?.trim() || null
        const isOutboundRecipient =
          outbound && normalizedAddress !== fromAddress

        if (existing) {
          existing.interactionCount += 1
          existing.outboundCount += isOutboundRecipient ? 1 : 0
          if (!existing.name && name) {
            existing.name = name
          }
          continue
        }

        contacts.set(normalizedAddress, {
          address: mailAddress.address.trim(),
          name,
          interactionCount: 1,
          outboundCount: isOutboundRecipient ? 1 : 0,
          lastInteractionAt: message.sortAt,
        })
      }
    }

    return [...contacts.values()]
      .sort(
        (left, right) =>
          right.outboundCount - left.outboundCount ||
          right.interactionCount - left.interactionCount ||
          right.lastInteractionAt - left.lastInteractionAt ||
          left.address.localeCompare(right.address)
      )
      .slice(0, 300)
      .map((contact) => ({
        address: contact.address,
        name: contact.name,
        lastInteractionAt: new Date(contact.lastInteractionAt).toISOString(),
      }))
  },
})

export const listMessages = query({
  args: {
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
    const user = await getCurrentUser(ctx)
    const accountPublicIds = new Set(args.accountPublicIds ?? [])
    const accountIds = new Set<Id<"mailAccounts">>()
    if (accountPublicIds.size > 0) {
      const accounts = await ctx.db
        .query("mailAccounts")
        .withIndex("by_user", (queryBuilder) =>
          queryBuilder.eq("userId", user._id)
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
                .eq("userId", user._id)
                .eq("accountId", onlyAccountId)
                .eq("mailboxPath", path)
                .eq("seen", false)
            )
        : onlyAccountId && path
          ? ctx.db
              .query("mailListEntries")
              .withIndex("by_user_account_path_sort", (queryBuilder) =>
                queryBuilder
                  .eq("userId", user._id)
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
                      .eq("userId", user._id)
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
                        .eq("userId", user._id)
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
                          .eq("userId", user._id)
                          .eq("mailboxSpecialUse", undefined)
                          .eq("seen", false)
                    )
                : customFolders
                  ? ctx.db
                      .query("mailListEntries")
                      .withIndex("by_user_special_use_sort", (queryBuilder) =>
                        queryBuilder
                          .eq("userId", user._id)
                          .eq("mailboxSpecialUse", undefined)
                      )
                  : specialUse && args.unread
                    ? ctx.db
                        .query("mailListEntries")
                        .withIndex(
                          "by_user_special_use_seen_sort",
                          (queryBuilder) =>
                            queryBuilder
                              .eq("userId", user._id)
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
                                .eq("userId", user._id)
                                .eq("mailboxSpecialUse", specialUse)
                          )
                      : args.unread
                        ? ctx.db
                            .query("mailListEntries")
                            .withIndex("by_user_seen_sort", (queryBuilder) =>
                              queryBuilder
                                .eq("userId", user._id)
                                .eq("seen", false)
                            )
                        : ctx.db
                            .query("mailListEntries")
                            .withIndex("by_user_sort", (queryBuilder) =>
                              queryBuilder.eq("userId", user._id)
                            )

    let entriesQuery =
      searchPlan?.field === "all"
        ? ctx.db
            .query("mailListEntries")
            .withSearchIndex("search_all_v2", (queryBuilder) => {
              let searched = queryBuilder
                .search("searchText", searchPlan.query)
                .eq("userId", user._id)
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
                  .eq("userId", user._id)
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
          : searchPlan?.field === "from"
            ? ctx.db
                .query("mailListEntries")
                .withSearchIndex("search_from_v2", (queryBuilder) => {
                  let searched = queryBuilder
                    .search("fromSearch", searchPlan.query)
                    .eq("userId", user._id)
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
                      .eq("userId", user._id)
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
        queryBuilder.neq(queryBuilder.field("userId"), user._id)
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

export const getMessage = query({
  args: { messagePublicId: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const message = await findOwnedMessage(ctx, user._id, args.messagePublicId)
    return message ? await toMessageDto(ctx, message) : null
  },
})

export const getThread = query({
  args: { messagePublicId: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const message = await findOwnedMessage(ctx, user._id, args.messagePublicId)
    if (!message) return null
    const [thread, account] = await Promise.all([
      ctx.db.get(message.threadId),
      ctx.db.get(message.accountId),
    ])
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
        candidate.userId === user._id && candidate.deletedAt === undefined
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
  const [account, attachments, body, location] = await Promise.all([
    ctx.db.get(message.accountId),
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
    path: mailbox?.path ?? null,
    subject: message.subject ?? null,
    from: message.from ?? null,
    to: message.to,
    sentAt: toIso(message.sentAt),
    snippet: message.snippet ?? null,
    seen: message.flags.seen,
    flagged: message.flags.flagged,
    hasAttachments: message.hasAttachments,
    sizeBytes: null,
    openTracking: null,
    clickTracking: null,
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
    openTracking: null,
    clickTracking: null,
  }
}

async function toThreadItem(ctx: QueryCtx, message: Doc<"mailMessages">) {
  const dto = await toMessageDto(ctx, message)
  const location = await firstMessageLocation(ctx, message._id)
  const mailbox = location ? await ctx.db.get(location.mailboxId) : null
  return {
    ...dto,
    mailboxName: mailbox?.name ?? null,
    mailboxSpecialUse: mailbox?.specialUse ?? null,
    isDraft: message.flags.draft,
  }
}

function toIso(value: number | undefined) {
  return value === undefined ? null : new Date(value).toISOString()
}

function normalizeEmailAddress(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? ""
}
