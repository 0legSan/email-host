import { v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server"

export const getUnreadCount = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("mailListEntries")
      .withIndex("by_user_special_use_seen_sort", (queryBuilder) =>
        queryBuilder
          .eq("userId", args.userId)
          .eq("mailboxSpecialUse", "\\Inbox")
          .eq("seen", false)
      )
      .collect()
    return entries.filter((entry) => entry.visible).length
  },
})

export const saveSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    expirationTime: v.optional(v.number()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (queryBuilder) =>
        queryBuilder.eq("endpoint", args.endpoint)
      )
      .unique()
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: now,
      })
      return existing._id
    }
    return await ctx.db.insert("pushSubscriptions", {
      ...args,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const deleteSubscription = internalMutation({
  args: {
    userId: v.id("users"),
    endpoint: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (queryBuilder) =>
        queryBuilder.eq("endpoint", args.endpoint)
      )
      .unique()
    if (subscription?.userId === args.userId) {
      await ctx.db.delete(subscription._id)
    }
  },
})

export const removeSubscription = internalMutation({
  args: { subscriptionId: v.id("pushSubscriptions") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.subscriptionId)
  },
})

export const listSubscriptions = internalQuery({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    if (args.userId) {
      return await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_user", (queryBuilder) =>
          queryBuilder.eq("userId", args.userId!)
        )
        .collect()
    }
    return await ctx.db.query("pushSubscriptions").collect()
  },
})

export const getPushEventWakeState = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [pending, retry, processing] = await Promise.all([
      ctx.db
        .query("pushEvents")
        .withIndex("by_status_attempt", (queryBuilder) =>
          queryBuilder.eq("status", "pending")
        )
        .order("asc")
        .first(),
      ctx.db
        .query("pushEvents")
        .withIndex("by_status_attempt", (queryBuilder) =>
          queryBuilder.eq("status", "retry")
        )
        .order("asc")
        .first(),
      ctx.db
        .query("pushEvents")
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

export const claimEvents = internalMutation({
  args: {
    limit: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("pushEvents")
      .withIndex("by_status_attempt", (queryBuilder) =>
        queryBuilder.eq("status", "pending").lte("nextAttemptAt", args.now)
      )
      .take(args.limit)
    const retry = await ctx.db
      .query("pushEvents")
      .withIndex("by_status_attempt", (queryBuilder) =>
        queryBuilder.eq("status", "retry").lte("nextAttemptAt", args.now)
      )
      .take(Math.max(0, args.limit - pending.length))
    const abandoned = await ctx.db
      .query("pushEvents")
      .withIndex("by_status_locked", (queryBuilder) =>
        queryBuilder
          .eq("status", "processing")
          .lte("lockedAt", args.now - 5 * 60 * 1000)
      )
      .take(Math.max(0, args.limit - pending.length - retry.length))
    const events = [...pending, ...retry, ...abandoned]

    return await Promise.all(
      events.map(async (event) => {
        await ctx.db.patch(event._id, {
          status: "processing",
          attempts: event.attempts + 1,
          lockedAt: args.now,
          updatedAt: args.now,
        })
        return {
          event: {
            ...event,
            status: "processing" as const,
            attempts: event.attempts + 1,
          },
          account: event.accountId ? await ctx.db.get(event.accountId) : null,
          deliverable: await isPushEventDeliverable(ctx, event),
        }
      })
    )
  },
})

async function isPushEventDeliverable(
  ctx: MutationCtx,
  event: Doc<"pushEvents">
) {
  if (event.type !== "mail:new") return true
  if (!event.messageId) return false
  const messageId = event.messageId

  const message = await ctx.db.get(messageId)
  if (
    !message ||
    message.userId !== event.userId ||
    message.deletedAt !== undefined ||
    message.flags.seen
  ) {
    return false
  }

  const entries = await ctx.db
    .query("mailListEntries")
    .withIndex("by_message", (queryBuilder) =>
      queryBuilder.eq("messageId", messageId)
    )
    .collect()

  return entries.some(
    (entry) =>
      entry.userId === event.userId &&
      entry.visible &&
      !entry.seen &&
      entry.mailboxSpecialUse?.toLocaleLowerCase() === "\\inbox"
  )
}

export const finishEvent = internalMutation({
  args: {
    eventId: v.id("pushEvents"),
    status: v.union(
      v.literal("retry"),
      v.literal("succeeded"),
      v.literal("failed")
    ),
    nextAttemptAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event) return
    await ctx.db.patch(event._id, {
      status: args.status,
      nextAttemptAt: args.nextAttemptAt ?? event.nextAttemptAt,
      lastError: args.lastError,
      lockedAt: undefined,
      processedAt: args.status === "retry" ? undefined : args.now,
      updatedAt: args.now,
    })
  },
})

export const createReleaseNotification = internalMutation({
  args: { version: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("appReleaseNotifications")
      .withIndex("by_version", (queryBuilder) =>
        queryBuilder.eq("version", args.version)
      )
      .unique()
    if (existing) return false
    await ctx.db.insert("appReleaseNotifications", {
      version: args.version,
      notifiedAt: Date.now(),
    })
    return true
  },
})
