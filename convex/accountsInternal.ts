import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import { internalMutation, internalQuery } from "./_generated/server"

const provider = v.union(
  v.literal("gmail"),
  v.literal("yandex"),
  v.literal("mailru"),
  v.literal("rambler"),
  v.literal("beget"),
  v.literal("custom")
)
const encryptedCredentials = v.object({
  imapHost: v.string(),
  imapPort: v.number(),
  imapSecure: v.boolean(),
  imapUsername: v.string(),
  imapPasswordCiphertext: v.string(),
  imapPasswordIv: v.string(),
  imapPasswordTag: v.string(),
  smtpHost: v.string(),
  smtpPort: v.number(),
  smtpSecure: v.boolean(),
  smtpUsername: v.string(),
  smtpPasswordCiphertext: v.string(),
  smtpPasswordIv: v.string(),
  smtpPasswordTag: v.string(),
})

export const list = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const accounts = await ctx.db
      .query("mailAccounts")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", args.userId)
      )
      .collect()

    return await Promise.all(
      accounts
        .filter((account) => account.deletedAt === undefined)
        .map(async (account) => {
          const credentials = await ctx.db
            .query("mailAccountCredentials")
            .withIndex("by_account", (queryBuilder) =>
              queryBuilder.eq("accountId", account._id)
            )
            .unique()
          return {
            account,
            hasCredentials: credentials !== null,
          }
        })
    )
  },
})

export const listWorkerAccounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const accounts = await ctx.db.query("mailAccounts").collect()
    const activeAccounts = accounts.filter(
      (account) =>
        account.deletedAt === undefined &&
        (account.connectionStatus === "active" ||
          account.connectionStatus === "connect_error")
    )

    return (
      await Promise.all(
        activeAccounts.map(async (account) => {
          const credentials = await ctx.db
            .query("mailAccountCredentials")
            .withIndex("by_account", (queryBuilder) =>
              queryBuilder.eq("accountId", account._id)
            )
            .unique()
          return credentials
            ? {
                id: account._id,
                provider: account.provider,
                address: account.address,
                credentialVersion: credentials.updatedAt,
                imapHost: credentials.imapHost,
              }
            : null
        })
      )
    )
      .filter((account) => account !== null)
      .sort((first, second) => first.id.localeCompare(second.id))
  },
})

export const getByPublicId = internalQuery({
  args: {
    userId: v.id("users"),
    publicId: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("mailAccounts")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.publicId)
      )
      .unique()

    if (
      !account ||
      account.userId !== args.userId ||
      account.deletedAt !== undefined
    ) {
      return null
    }

    return account
  },
})

export const getById = internalQuery({
  args: {
    accountId: v.id("mailAccounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId)
    return account && account.deletedAt === undefined ? account : null
  },
})

export const getCredentials = internalQuery({
  args: {
    accountId: v.id("mailAccounts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("mailAccountCredentials")
      .withIndex("by_account", (queryBuilder) =>
        queryBuilder.eq("accountId", args.accountId)
      )
      .unique()
  },
})

export const connect = internalMutation({
  args: {
    userId: v.id("users"),
    publicId: v.string(),
    emailengineAccountId: v.string(),
    provider,
    address: v.string(),
    displayName: v.optional(v.string()),
    credentials: encryptedCredentials,
  },
  handler: async (ctx, args) => {
    const accountKey = `${args.userId}:${args.address}`
    const existing = await ctx.db
      .query("mailAccounts")
      .withIndex("by_user_address_key", (queryBuilder) =>
        queryBuilder.eq("accountKey", accountKey)
      )
      .unique()
    const now = Date.now()

    if (existing && existing.deletedAt === undefined) {
      const currentCredentials = await ctx.db
        .query("mailAccountCredentials")
        .withIndex("by_account", (queryBuilder) =>
          queryBuilder.eq("accountId", existing._id)
        )
        .unique()

      if (currentCredentials) {
        await ctx.db.patch(currentCredentials._id, {
          ...args.credentials,
          updatedAt: now,
        })
      } else {
        await ctx.db.insert("mailAccountCredentials", {
          accountId: existing._id,
          ...args.credentials,
          createdAt: now,
          updatedAt: now,
        })
      }

      await ctx.db.patch(existing._id, {
        provider: args.provider,
        displayName: args.displayName,
        connectionStatus: "active",
        syncStatus: "idle",
        lastError: undefined,
        updatedAt: now,
      })
      return await ctx.db.get(existing._id)
    }

    const accountId = await ctx.db.insert("mailAccounts", {
      publicId: args.publicId,
      userId: args.userId,
      accountKey,
      emailengineAccountId: args.emailengineAccountId,
      provider: args.provider,
      address: args.address,
      displayName: args.displayName,
      connectionStatus: "active",
      syncStatus: "idle",
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert("mailAccountCredentials", {
      accountId,
      ...args.credentials,
      createdAt: now,
      updatedAt: now,
    })
    return await ctx.db.get(accountId)
  },
})

export const reconnect = internalMutation({
  args: {
    userId: v.id("users"),
    publicId: v.string(),
    provider: v.optional(provider),
    displayName: v.optional(v.string()),
    credentials: encryptedCredentials,
  },
  handler: async (ctx, args) => {
    const account = await findOwnedAccount(ctx, args.userId, args.publicId)

    if (!account) {
      return null
    }

    const now = Date.now()
    const currentCredentials = await ctx.db
      .query("mailAccountCredentials")
      .withIndex("by_account", (queryBuilder) =>
        queryBuilder.eq("accountId", account._id)
      )
      .unique()

    if (currentCredentials) {
      await ctx.db.patch(currentCredentials._id, {
        ...args.credentials,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert("mailAccountCredentials", {
        accountId: account._id,
        ...args.credentials,
        createdAt: now,
        updatedAt: now,
      })
    }

    await ctx.db.patch(account._id, {
      provider: args.provider ?? account.provider,
      displayName: args.displayName,
      connectionStatus: "active",
      syncStatus: "idle",
      lastError: undefined,
      updatedAt: now,
    })
    return await ctx.db.get(account._id)
  },
})

export const requestSync = internalMutation({
  args: {
    userId: v.id("users"),
    publicId: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await findOwnedAccount(ctx, args.userId, args.publicId)
    if (!account) return null

    await ctx.db.patch(account._id, {
      syncStatus: "incremental_sync",
      lastError: undefined,
      updatedAt: Date.now(),
    })
    return await ctx.db.get(account._id)
  },
})

export const update = internalMutation({
  args: {
    userId: v.id("users"),
    publicId: v.string(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = await findOwnedAccount(ctx, args.userId, args.publicId)
    if (!account) return null

    await ctx.db.patch(account._id, {
      label: args.label,
      updatedAt: Date.now(),
    })
    return await ctx.db.get(account._id)
  },
})

export const remove = internalMutation({
  args: {
    userId: v.id("users"),
    publicId: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await findOwnedAccount(ctx, args.userId, args.publicId)
    if (!account) return false

    const credentials = await ctx.db
      .query("mailAccountCredentials")
      .withIndex("by_account", (queryBuilder) =>
        queryBuilder.eq("accountId", account._id)
      )
      .unique()
    if (credentials) {
      await ctx.db.delete(credentials._id)
    }

    const now = Date.now()
    await ctx.db.patch(account._id, {
      connectionStatus: "disconnected",
      syncStatus: "paused",
      deletedAt: now,
      updatedAt: now,
    })
    return true
  },
})

async function findOwnedAccount(
  ctx: MutationCtx,
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
