import { v } from "convex/values"

import { internalMutation, internalQuery } from "./_generated/server"

const userRole = v.union(v.literal("owner"), v.literal("user"))

export const seedOwner = internalMutation({
  args: {
    publicId: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (queryBuilder) =>
        queryBuilder.eq("email", args.email)
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: "owner",
        deletedAt: undefined,
        updatedAt: now,
      })
      return existing
    }

    const userId = await ctx.db.insert("users", {
      publicId: args.publicId,
      email: args.email,
      passwordHash: args.passwordHash,
      role: "owner",
      displayName: args.displayName,
      createdAt: now,
      updatedAt: now,
    })

    return await ctx.db.get(userId)
  },
})

export const findUserByEmail = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (queryBuilder) =>
        queryBuilder.eq("email", args.email)
      )
      .unique()
  },
})

export const createSession = internalMutation({
  args: {
    publicId: v.string(),
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_token_hash", (queryBuilder) =>
        queryBuilder.eq("tokenHash", args.tokenHash)
      )
      .unique()

    if (existing) {
      return existing
    }

    const id = await ctx.db.insert("sessions", {
      ...args,
      createdAt: Date.now(),
    })

    return await ctx.db.get(id)
  },
})

export const getSession = internalQuery({
  args: {
    tokenHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token_hash", (queryBuilder) =>
        queryBuilder.eq("tokenHash", args.tokenHash)
      )
      .unique()

    if (
      !session ||
      session.revokedAt !== undefined ||
      session.expiresAt <= args.now
    ) {
      return null
    }

    const user = await ctx.db.get(session.userId)

    if (!user || user.deletedAt !== undefined) {
      return null
    }

    return {
      session,
      user,
    }
  },
})

export const refreshSession = internalMutation({
  args: {
    tokenHash: v.string(),
    now: v.number(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token_hash", (queryBuilder) =>
        queryBuilder.eq("tokenHash", args.tokenHash)
      )
      .unique()

    if (
      !session ||
      session.revokedAt !== undefined ||
      session.expiresAt <= args.now
    ) {
      return false
    }

    await ctx.db.patch(session._id, {
      expiresAt: args.expiresAt,
    })
    return true
  },
})

export const revokeSession = internalMutation({
  args: {
    tokenHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token_hash", (queryBuilder) =>
        queryBuilder.eq("tokenHash", args.tokenHash)
      )
      .unique()

    if (session && session.revokedAt === undefined) {
      await ctx.db.patch(session._id, {
        revokedAt: args.now,
      })
    }
  },
})

export const createRegistrationInvite = internalMutation({
  args: {
    publicId: v.string(),
    tokenHash: v.string(),
    createdByUserId: v.id("users"),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const id = await ctx.db.insert("registrationInvites", {
      ...args,
      createdAt: now,
      updatedAt: now,
    })
    return await ctx.db.get(id)
  },
})

export const getRegistrationInvite = internalQuery({
  args: {
    tokenHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("registrationInvites")
      .withIndex("by_token_hash", (queryBuilder) =>
        queryBuilder.eq("tokenHash", args.tokenHash)
      )
      .unique()

    if (
      !invite ||
      invite.acceptedAt !== undefined ||
      invite.revokedAt !== undefined ||
      invite.expiresAt <= args.now
    ) {
      return null
    }

    return invite
  },
})

export const registerWithInvite = internalMutation({
  args: {
    inviteTokenHash: v.string(),
    publicId: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    displayName: v.optional(v.string()),
    sessionPublicId: v.string(),
    sessionTokenHash: v.string(),
    sessionExpiresAt: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (queryBuilder) =>
        queryBuilder.eq("email", args.email)
      )
      .unique()

    if (existingUser) {
      return { ok: false as const, code: "email_already_registered" as const }
    }

    const invite = await ctx.db
      .query("registrationInvites")
      .withIndex("by_token_hash", (queryBuilder) =>
        queryBuilder.eq("tokenHash", args.inviteTokenHash)
      )
      .unique()

    if (
      !invite ||
      invite.acceptedAt !== undefined ||
      invite.revokedAt !== undefined ||
      invite.expiresAt <= args.now
    ) {
      return { ok: false as const, code: "invite_invalid" as const }
    }

    const userId = await ctx.db.insert("users", {
      publicId: args.publicId,
      email: args.email,
      passwordHash: args.passwordHash,
      role: "user",
      displayName: args.displayName,
      createdAt: args.now,
      updatedAt: args.now,
    })

    await ctx.db.patch(invite._id, {
      acceptedByUserId: userId,
      acceptedAt: args.now,
      updatedAt: args.now,
    })
    await ctx.db.insert("sessions", {
      publicId: args.sessionPublicId,
      userId,
      tokenHash: args.sessionTokenHash,
      expiresAt: args.sessionExpiresAt,
      createdAt: args.now,
    })

    return {
      ok: true as const,
      user: await ctx.db.get(userId),
    }
  },
})

export const listUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect()
  },
})

export const deactivateUser = internalMutation({
  args: {
    requestedByUserId: v.id("users"),
    targetPublicId: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const target = await ctx.db
      .query("users")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.targetPublicId)
      )
      .unique()

    if (!target) {
      return { ok: false as const, code: "user_not_found" as const }
    }

    if (target._id === args.requestedByUserId || target.role === "owner") {
      return { ok: false as const, code: "owner_forbidden" as const }
    }

    if (target.deletedAt !== undefined) {
      return { ok: true as const, user: target }
    }

    await ctx.db.patch(target._id, {
      deletedAt: args.now,
      updatedAt: args.now,
    })

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", target._id)
      )
      .collect()
    for (const session of sessions) {
      if (session.revokedAt === undefined) {
        await ctx.db.patch(session._id, { revokedAt: args.now })
      }
    }

    const accounts = await ctx.db
      .query("mailAccounts")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", target._id)
      )
      .collect()
    for (const account of accounts) {
      if (account.deletedAt === undefined) {
        await ctx.db.patch(account._id, {
          connectionStatus: "disconnected",
          syncStatus: "paused",
          updatedAt: args.now,
        })
      }
    }

    const subscriptions = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", target._id)
      )
      .collect()
    for (const subscription of subscriptions) {
      await ctx.db.delete(subscription._id)
    }

    return {
      ok: true as const,
      user: await ctx.db.get(target._id),
    }
  },
})

export const createPasswordResetLink = internalMutation({
  args: {
    publicId: v.string(),
    tokenHash: v.string(),
    targetPublicId: v.string(),
    createdByUserId: v.id("users"),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.targetPublicId)
      )
      .unique()

    if (!user) {
      return { ok: false as const, code: "user_not_found" as const }
    }

    if (user.deletedAt !== undefined) {
      return { ok: false as const, code: "user_deactivated" as const }
    }

    const now = Date.now()
    const id = await ctx.db.insert("passwordResetLinks", {
      publicId: args.publicId,
      tokenHash: args.tokenHash,
      userId: user._id,
      createdByUserId: args.createdByUserId,
      expiresAt: args.expiresAt,
      createdAt: now,
      updatedAt: now,
    })

    return {
      ok: true as const,
      link: await ctx.db.get(id),
      user,
    }
  },
})

export const getPasswordResetLink = internalQuery({
  args: {
    tokenHash: v.string(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("passwordResetLinks")
      .withIndex("by_token_hash", (queryBuilder) =>
        queryBuilder.eq("tokenHash", args.tokenHash)
      )
      .unique()

    if (
      !link ||
      link.usedAt !== undefined ||
      link.revokedAt !== undefined ||
      link.expiresAt <= args.now
    ) {
      return null
    }

    return link
  },
})

export const resetPassword = internalMutation({
  args: {
    tokenHash: v.string(),
    passwordHash: v.string(),
    sessionPublicId: v.string(),
    sessionTokenHash: v.string(),
    sessionExpiresAt: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("passwordResetLinks")
      .withIndex("by_token_hash", (queryBuilder) =>
        queryBuilder.eq("tokenHash", args.tokenHash)
      )
      .unique()

    if (
      !link ||
      link.usedAt !== undefined ||
      link.revokedAt !== undefined ||
      link.expiresAt <= args.now
    ) {
      return { ok: false as const, code: "reset_invalid" as const }
    }

    const user = await ctx.db.get(link.userId)

    if (!user || user.deletedAt !== undefined) {
      return { ok: false as const, code: "reset_invalid" as const }
    }

    await ctx.db.patch(link._id, {
      usedAt: args.now,
      updatedAt: args.now,
    })
    await ctx.db.patch(user._id, {
      passwordHash: args.passwordHash,
      updatedAt: args.now,
    })

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", user._id)
      )
      .collect()
    for (const session of sessions) {
      if (session.revokedAt === undefined) {
        await ctx.db.patch(session._id, { revokedAt: args.now })
      }
    }

    await ctx.db.insert("sessions", {
      publicId: args.sessionPublicId,
      userId: user._id,
      tokenHash: args.sessionTokenHash,
      expiresAt: args.sessionExpiresAt,
      createdAt: args.now,
    })

    return {
      ok: true as const,
      user: await ctx.db.get(user._id),
    }
  },
})

export const importUser = internalMutation({
  args: {
    publicId: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: userRole,
    displayName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.publicId)
      )
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, args)
      return existing._id
    }

    return await ctx.db.insert("users", args)
  },
})
