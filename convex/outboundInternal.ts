import { v } from "convex/values"

import { internalMutation, internalQuery } from "./_generated/server"

export const prepare = internalMutation({
  args: {
    userId: v.id("users"),
    accountPublicId: v.string(),
    clientRequestId: v.string(),
    publicId: v.string(),
    payloadHash: v.string(),
    trackOpens: v.boolean(),
    trackClicks: v.boolean(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("mailAccounts")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.accountPublicId)
      )
      .unique()
    if (
      !account ||
      account.userId !== args.userId ||
      account.deletedAt !== undefined
    ) {
      return { kind: "account_not_found" as const }
    }

    const userRequestKey = `${args.userId}:${args.clientRequestId}`
    const existing = await ctx.db
      .query("outboundMessages")
      .withIndex("by_user_request", (queryBuilder) =>
        queryBuilder.eq("userRequestKey", userRequestKey)
      )
      .unique()
    if (existing) {
      return existing.accountId !== account._id ||
        existing.payloadHash !== args.payloadHash
        ? { kind: "conflict" as const }
        : { kind: "existing" as const, account, outbound: existing }
    }

    const now = Date.now()
    const id = await ctx.db.insert("outboundMessages", {
      publicId: args.publicId,
      userId: args.userId,
      accountId: account._id,
      userRequestKey,
      clientRequestId: args.clientRequestId,
      status: "queued",
      payloadHash: args.payloadHash,
      trackOpens: args.trackOpens,
      trackClicks: args.trackClicks,
      openCount: 0,
      clickCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    return {
      kind: "created" as const,
      account,
      outbound: (await ctx.db.get(id))!,
    }
  },
})

export const setStatus = internalMutation({
  args: {
    outboundId: v.id("outboundMessages"),
    status: v.union(
      v.literal("submitting"),
      v.literal("sent"),
      v.literal("failed")
    ),
    emailengineQueueId: v.optional(v.string()),
    emailengineMessageId: v.optional(v.string()),
    lastError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const outbound = await ctx.db.get(args.outboundId)
    if (!outbound) return null
    await ctx.db.patch(outbound._id, {
      status: args.status,
      emailengineQueueId: args.emailengineQueueId,
      emailengineMessageId: args.emailengineMessageId,
      lastError: args.lastError,
      updatedAt: Date.now(),
    })
    return await ctx.db.get(outbound._id)
  },
})

export const addClickLink = internalMutation({
  args: {
    outboundId: v.id("outboundMessages"),
    publicId: v.string(),
    url: v.string(),
    label: v.optional(v.string()),
    elementType: v.union(v.literal("link"), v.literal("button")),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    return await ctx.db.insert("outboundClickLinks", {
      outboundMessageId: args.outboundId,
      publicId: args.publicId,
      url: args.url,
      label: args.label,
      elementType: args.elementType,
      clickCount: 0,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const getReference = internalQuery({
  args: {
    userId: v.id("users"),
    messagePublicId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("mailMessages")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.messagePublicId)
      )
      .unique()
    return message &&
      message.userId === args.userId &&
      message.deletedAt === undefined
      ? { internetMessageId: message.internetMessageId }
      : null
  },
})

export const getSentMailbox = internalQuery({
  args: {
    accountId: v.id("mailAccounts"),
  },
  handler: async (ctx, args) => {
    const mailboxes = await ctx.db
      .query("mailboxes")
      .withIndex("by_account", (queryBuilder) =>
        queryBuilder.eq("accountId", args.accountId)
      )
      .collect()
    return (
      mailboxes.find(
        (mailbox) =>
          mailbox.deletedAt === undefined &&
          mailbox.specialUse?.toLocaleLowerCase() === "\\sent"
      ) ?? null
    )
  },
})

export const recordOpen = internalMutation({
  args: { outboundPublicId: v.string() },
  handler: async (ctx, args) => {
    const outbound = await ctx.db
      .query("outboundMessages")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.outboundPublicId)
      )
      .unique()
    if (!outbound?.trackOpens) return false

    const now = Date.now()
    await ctx.db.patch(outbound._id, {
      openCount: outbound.openCount + 1,
      firstOpenedAt: outbound.firstOpenedAt ?? now,
      lastOpenedAt: now,
      updatedAt: now,
    })
    return true
  },
})

export const recordClick = internalMutation({
  args: { linkPublicId: v.string() },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("outboundClickLinks")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.linkPublicId)
      )
      .unique()
    if (!link) return null

    const now = Date.now()
    await ctx.db.patch(link._id, {
      clickCount: link.clickCount + 1,
      firstClickedAt: link.firstClickedAt ?? now,
      lastClickedAt: now,
      updatedAt: now,
    })
    const outbound = await ctx.db.get(link.outboundMessageId)
    if (outbound?.trackClicks) {
      await ctx.db.patch(outbound._id, {
        clickCount: outbound.clickCount + 1,
        firstClickedAt: outbound.firstClickedAt ?? now,
        lastClickedAt: now,
        updatedAt: now,
      })
    }
    return link.url
  },
})
