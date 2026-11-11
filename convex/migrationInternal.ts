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
const credentials = v.object({
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
const preferences = v.object({
  sidebarOrder: v.any(),
  signatures: v.any(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
const accountBundle = v.object({
  publicId: v.string(),
  emailengineAccountId: v.string(),
  provider,
  address: v.string(),
  label: v.optional(v.string()),
  displayName: v.optional(v.string()),
  credentials,
  createdAt: v.number(),
  updatedAt: v.number(),
})
const profileBundle = v.object({
  publicId: v.string(),
  name: v.string(),
  accountPublicIds: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
const pushSubscriptionBundle = v.object({
  endpoint: v.string(),
  p256dh: v.string(),
  auth: v.string(),
  expirationTime: v.optional(v.number()),
  userAgent: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const importOwnerBundle = internalMutation({
  args: {
    owner: v.object({
      publicId: v.string(),
      email: v.string(),
      passwordHash: v.string(),
      displayName: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    preferences: v.optional(preferences),
    accounts: v.array(accountBundle),
    profiles: v.array(profileBundle),
  },
  handler: async (ctx, args) => {
    const ownerId = await upsertOwner(ctx, args.owner)
    const accountIds = new Map<string, Id<"mailAccounts">>()

    for (const account of args.accounts) {
      accountIds.set(
        account.publicId,
        await upsertAccount(ctx, ownerId, account, true)
      )
    }
    if (args.preferences) {
      await upsertPreferences(ctx, ownerId, args.preferences)
    }
    for (const profile of args.profiles) {
      await upsertProfile(ctx, ownerId, profile, accountIds)
    }

    return {
      ownerId,
      accounts: accountIds.size,
      profiles: args.profiles.length,
      preferences: args.preferences !== undefined,
    }
  },
})

export const importUserBundle = internalMutation({
  args: {
    user: v.object({
      publicId: v.string(),
      email: v.string(),
      passwordHash: v.string(),
      displayName: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    preferences: v.optional(preferences),
    accounts: v.array(accountBundle),
    profiles: v.array(profileBundle),
    pushSubscriptions: v.array(pushSubscriptionBundle),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect()
    const activeOwners = users.filter(
      (user) => user.role === "owner" && user.deletedAt === undefined
    )
    if (activeOwners.length !== 1) {
      throw new Error(`Expected one active owner, found ${activeOwners.length}`)
    }

    const selectedUser = users.find(
      (user) =>
        user.publicId === args.user.publicId || user.email === args.user.email
    )
    const otherNonOwners = users.filter(
      (user) => user.role !== "owner" && user._id !== selectedUser?._id
    )
    for (const otherUser of otherNonOwners) {
      const [accounts, profiles, preferences, pushSubscriptions] =
        await Promise.all([
          ctx.db
            .query("mailAccounts")
            .withIndex("by_user", (queryBuilder) =>
              queryBuilder.eq("userId", otherUser._id)
            )
            .collect(),
          ctx.db
            .query("mailAccountProfiles")
            .withIndex("by_user", (queryBuilder) =>
              queryBuilder.eq("userId", otherUser._id)
            )
            .collect(),
          ctx.db
            .query("userMailPreferences")
            .withIndex("by_user", (queryBuilder) =>
              queryBuilder.eq("userId", otherUser._id)
            )
            .collect(),
          ctx.db
            .query("pushSubscriptions")
            .withIndex("by_user", (queryBuilder) =>
              queryBuilder.eq("userId", otherUser._id)
            )
            .collect(),
        ])
      if (
        otherUser.deletedAt === undefined ||
        accounts.some((account) => account.deletedAt === undefined) ||
        profiles.some((profile) => profile.deletedAt === undefined) ||
        preferences.length !== 0 ||
        pushSubscriptions.length !== 0
      ) {
        throw new Error(
          "Target contains an active or configured non-owner user"
        )
      }
    }

    const userId = await upsertMigratedUser(ctx, args.user)
    const accountIds = new Map<string, Id<"mailAccounts">>()
    for (const account of args.accounts) {
      accountIds.set(
        account.publicId,
        await upsertAccount(ctx, userId, account, false)
      )
    }
    if (args.preferences) {
      await upsertPreferences(ctx, userId, args.preferences)
    }
    for (const profile of args.profiles) {
      await upsertProfile(ctx, userId, profile, accountIds)
    }
    for (const subscription of args.pushSubscriptions) {
      await upsertPushSubscription(ctx, userId, subscription)
    }

    return {
      userId,
      accounts: accountIds.size,
      profiles: args.profiles.length,
      preferences: args.preferences !== undefined,
      pushSubscriptions: args.pushSubscriptions.length,
    }
  },
})

export const markMigratedAccountAuthError = internalMutation({
  args: {
    userPublicId: v.string(),
    userEmail: v.string(),
    accountPublicId: v.string(),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect()
    const user = users.find(
      (candidate) =>
        candidate.publicId === args.userPublicId ||
        candidate.email === args.userEmail
    )
    if (!user || user.role !== "user" || user.deletedAt !== undefined) {
      throw new Error("Migrated user is unavailable")
    }

    const account = await ctx.db
      .query("mailAccounts")
      .withIndex("by_public_id", (queryBuilder) =>
        queryBuilder.eq("publicId", args.accountPublicId)
      )
      .unique()
    if (
      !account ||
      account.userId !== user._id ||
      account.deletedAt !== undefined
    ) {
      throw new Error("Migrated user account is unavailable")
    }

    await ctx.db.patch(account._id, {
      connectionStatus: "auth_error",
      syncStatus: "paused",
      lastError: "Mail provider authentication failed",
      updatedAt: Date.now(),
    })
  },
})

export const inspectUserMigration = internalQuery({
  args: {
    publicId: v.string(),
    email: v.string(),
    passwordHash: v.string(),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").collect()
    const byPublicId = users.find((user) => user.publicId === args.publicId)
    const byEmail = users.find((user) => user.email === args.email)
    if (byPublicId && byEmail && byPublicId._id !== byEmail._id) {
      throw new Error("Target public id and email resolve to different users")
    }
    const user = byPublicId ?? byEmail
    if (user && user.role !== "user") {
      throw new Error("Selected target identity is not a regular user")
    }

    const otherNonOwnerUsers = users.filter(
      (candidate) => candidate.role !== "owner" && candidate._id !== user?._id
    )
    const otherNonOwnerSummaries = await Promise.all(
      otherNonOwnerUsers.map(async (candidate) => {
        const [
          candidateAccounts,
          candidateProfiles,
          candidatePreferences,
          candidatePush,
          candidateSessions,
        ] = await Promise.all([
          ctx.db
            .query("mailAccounts")
            .withIndex("by_user", (queryBuilder) =>
              queryBuilder.eq("userId", candidate._id)
            )
            .collect(),
          ctx.db
            .query("mailAccountProfiles")
            .withIndex("by_user", (queryBuilder) =>
              queryBuilder.eq("userId", candidate._id)
            )
            .collect(),
          ctx.db
            .query("userMailPreferences")
            .withIndex("by_user", (queryBuilder) =>
              queryBuilder.eq("userId", candidate._id)
            )
            .collect(),
          ctx.db
            .query("pushSubscriptions")
            .withIndex("by_user", (queryBuilder) =>
              queryBuilder.eq("userId", candidate._id)
            )
            .collect(),
          ctx.db
            .query("sessions")
            .withIndex("by_user", (queryBuilder) =>
              queryBuilder.eq("userId", candidate._id)
            )
            .collect(),
        ])

        return {
          active: candidate.deletedAt === undefined,
          accounts: candidateAccounts.filter(
            (account) => account.deletedAt === undefined
          ).length,
          profiles: candidateProfiles.filter(
            (profile) => profile.deletedAt === undefined
          ).length,
          preferences: candidatePreferences.length,
          pushSubscriptions: candidatePush.length,
          sessions: candidateSessions.length,
        }
      })
    )

    const accounts = user
      ? await ctx.db
          .query("mailAccounts")
          .withIndex("by_user", (queryBuilder) =>
            queryBuilder.eq("userId", user._id)
          )
          .collect()
      : []
    const profiles = user
      ? await ctx.db
          .query("mailAccountProfiles")
          .withIndex("by_user", (queryBuilder) =>
            queryBuilder.eq("userId", user._id)
          )
          .collect()
      : []
    const [accountCredentials, preferencesRows, pushSubscriptions, sessions] =
      user
        ? await Promise.all([
            Promise.all(
              accounts.map((account) =>
                ctx.db
                  .query("mailAccountCredentials")
                  .withIndex("by_account", (queryBuilder) =>
                    queryBuilder.eq("accountId", account._id)
                  )
                  .unique()
              )
            ),
            ctx.db
              .query("userMailPreferences")
              .withIndex("by_user", (queryBuilder) =>
                queryBuilder.eq("userId", user._id)
              )
              .collect(),
            ctx.db
              .query("pushSubscriptions")
              .withIndex("by_user", (queryBuilder) =>
                queryBuilder.eq("userId", user._id)
              )
              .collect(),
            ctx.db
              .query("sessions")
              .withIndex("by_user", (queryBuilder) =>
                queryBuilder.eq("userId", user._id)
              )
              .collect(),
          ])
        : [[], [], [], []]
    const mailboxGroups = await Promise.all(
      accounts.map((account) =>
        ctx.db
          .query("mailboxes")
          .withIndex("by_account", (queryBuilder) =>
            queryBuilder.eq("accountId", account._id)
          )
          .collect()
      )
    )
    const firstMessages = await Promise.all(
      accounts.map((account) =>
        ctx.db
          .query("mailMessages")
          .withIndex("by_account_received", (queryBuilder) =>
            queryBuilder.eq("accountId", account._id)
          )
          .first()
      )
    )

    return {
      activeOwners: users.filter(
        (candidate) =>
          candidate.role === "owner" && candidate.deletedAt === undefined
      ).length,
      nonOwners: users.filter((candidate) => candidate.role !== "owner").length,
      otherNonOwners: users.filter(
        (candidate) => candidate.role !== "owner" && candidate._id !== user?._id
      ).length,
      otherNonOwnerSummaries,
      userPresent: user !== undefined,
      userActive: user?.deletedAt === undefined,
      passwordHashMatches: user?.passwordHash === args.passwordHash,
      accounts: accounts.filter((account) => account.deletedAt === undefined)
        .length,
      credentials: accountCredentials.filter(Boolean).length,
      profiles: profiles.filter((profile) => profile.deletedAt === undefined)
        .length,
      preferences: preferencesRows.length,
      pushSubscriptions: pushSubscriptions.length,
      sessions: sessions.length,
      mailboxes: mailboxGroups
        .flat()
        .filter((mailbox) => mailbox.deletedAt === undefined).length,
      accountsWithMessages: firstMessages.filter(Boolean).length,
      accountSummaries: accounts
        .filter((account) => account.deletedAt === undefined)
        .map((account) => {
          const accountIndex = accounts.indexOf(account)
          return {
            accountId: account._id,
            provider: account.provider,
            connectionStatus: account.connectionStatus,
            syncStatus: account.syncStatus,
            lastSyncAt: account.lastSyncAt,
            lastError: account.lastError,
            mailboxes:
              mailboxGroups[accountIndex]?.filter(
                (mailbox) => mailbox.deletedAt === undefined
              ).length ?? 0,
            hasMessages: firstMessages[accountIndex] !== null,
          }
        }),
    }
  },
})

export const inspectTarget = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [
      users,
      accounts,
      profiles,
      messages,
      mailboxes,
      sessions,
      pushSubscriptions,
    ] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("mailAccounts").collect(),
      ctx.db.query("mailAccountProfiles").collect(),
      ctx.db.query("mailMessages").collect(),
      ctx.db.query("mailboxes").collect(),
      ctx.db.query("sessions").collect(),
      ctx.db.query("pushSubscriptions").collect(),
    ])
    return {
      users: users.length,
      activeOwners: users.filter(
        (user) => user.role === "owner" && user.deletedAt === undefined
      ).length,
      nonOwners: users.filter((user) => user.role !== "owner").length,
      accounts: accounts.length,
      profiles: profiles.length,
      messages: messages.length,
      mailboxes: mailboxes.length,
      sessions: sessions.length,
      pushSubscriptions: pushSubscriptions.length,
    }
  },
})

async function upsertOwner(
  ctx: MutationCtx,
  owner: {
    publicId: string
    email: string
    passwordHash: string
    displayName?: string
    createdAt: number
    updatedAt: number
  }
) {
  const byPublicId = await ctx.db
    .query("users")
    .withIndex("by_public_id", (queryBuilder) =>
      queryBuilder.eq("publicId", owner.publicId)
    )
    .unique()
  const existing =
    byPublicId ??
    (await ctx.db
      .query("users")
      .withIndex("by_email", (queryBuilder) =>
        queryBuilder.eq("email", owner.email)
      )
      .unique())
  const values = {
    ...owner,
    role: "owner" as const,
    deletedAt: undefined,
  }
  if (existing) {
    await ctx.db.patch(existing._id, values)
    return existing._id
  }
  return await ctx.db.insert("users", values)
}

async function upsertMigratedUser(
  ctx: MutationCtx,
  user: {
    publicId: string
    email: string
    passwordHash: string
    displayName?: string
    createdAt: number
    updatedAt: number
  }
) {
  const byPublicId = await ctx.db
    .query("users")
    .withIndex("by_public_id", (queryBuilder) =>
      queryBuilder.eq("publicId", user.publicId)
    )
    .unique()
  const byEmail = await ctx.db
    .query("users")
    .withIndex("by_email", (queryBuilder) =>
      queryBuilder.eq("email", user.email)
    )
    .unique()
  if (byPublicId && byEmail && byPublicId._id !== byEmail._id) {
    throw new Error("Target public id and email resolve to different users")
  }
  const existing = byPublicId ?? byEmail
  if (existing?.role === "owner") {
    throw new Error("Cannot replace the target owner with a regular user")
  }
  const values = {
    ...user,
    role: "user" as const,
    deletedAt: undefined,
  }
  if (existing) {
    await ctx.db.patch(existing._id, values)
    return existing._id
  }
  return await ctx.db.insert("users", values)
}

async function upsertAccount(
  ctx: MutationCtx,
  userId: Id<"users">,
  account: {
    publicId: string
    emailengineAccountId: string
    provider: "gmail" | "yandex" | "mailru" | "rambler" | "beget" | "custom"
    address: string
    label?: string
    displayName?: string
    credentials: typeof credentials.type
    createdAt: number
    updatedAt: number
  },
  resetRuntimeState: boolean
) {
  const accountKey = `${userId}:${account.address}`
  const byPublicId = await ctx.db
    .query("mailAccounts")
    .withIndex("by_public_id", (queryBuilder) =>
      queryBuilder.eq("publicId", account.publicId)
    )
    .unique()
  const byAccountKey = await ctx.db
    .query("mailAccounts")
    .withIndex("by_user_address_key", (queryBuilder) =>
      queryBuilder.eq("accountKey", accountKey)
    )
    .unique()
  if (byPublicId && byAccountKey && byPublicId._id !== byAccountKey._id) {
    throw new Error("Target account public id and address resolve differently")
  }
  const existing = byPublicId ?? byAccountKey
  if (existing && existing.userId !== userId) {
    throw new Error("Target account belongs to another user")
  }
  const values = {
    publicId: account.publicId,
    userId,
    accountKey,
    emailengineAccountId: account.emailengineAccountId,
    provider: account.provider,
    address: account.address,
    label: account.label,
    displayName: account.displayName,
    connectionStatus: "active" as const,
    syncStatus: "idle" as const,
    lastSyncAt: undefined,
    lastError: undefined,
    deletedAt: undefined,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
  const accountId = existing
    ? existing._id
    : await ctx.db.insert("mailAccounts", values)
  if (existing) {
    const runtimeState = resetRuntimeState
      ? {
          connectionStatus: values.connectionStatus,
          syncStatus: values.syncStatus,
          lastSyncAt: values.lastSyncAt,
          lastError: values.lastError,
        }
      : {}
    await ctx.db.patch(existing._id, {
      publicId: values.publicId,
      userId: values.userId,
      accountKey: values.accountKey,
      emailengineAccountId: values.emailengineAccountId,
      provider: values.provider,
      address: values.address,
      label: values.label,
      displayName: values.displayName,
      deletedAt: values.deletedAt,
      createdAt: values.createdAt,
      updatedAt: values.updatedAt,
      ...runtimeState,
    })
  }

  const currentCredentials = await ctx.db
    .query("mailAccountCredentials")
    .withIndex("by_account", (queryBuilder) =>
      queryBuilder.eq("accountId", accountId)
    )
    .unique()
  const credentialValues = {
    ...account.credentials,
    accountId,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  }
  if (currentCredentials) {
    await ctx.db.patch(currentCredentials._id, credentialValues)
  } else {
    await ctx.db.insert("mailAccountCredentials", credentialValues)
  }
  return accountId
}

async function upsertPreferences(
  ctx: MutationCtx,
  userId: Id<"users">,
  preferences: {
    sidebarOrder: unknown
    signatures: unknown
    createdAt: number
    updatedAt: number
  }
) {
  const existing = await ctx.db
    .query("userMailPreferences")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("userId", userId))
    .unique()
  const values = { userId, ...preferences }
  if (existing) {
    await ctx.db.patch(existing._id, preferences)
  } else {
    await ctx.db.insert("userMailPreferences", values)
  }
}

async function upsertProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  profile: {
    publicId: string
    name: string
    accountPublicIds: string[]
    createdAt: number
    updatedAt: number
  },
  accountIds: Map<string, Id<"mailAccounts">>
) {
  const existing = await ctx.db
    .query("mailAccountProfiles")
    .withIndex("by_public_id", (queryBuilder) =>
      queryBuilder.eq("publicId", profile.publicId)
    )
    .unique()
  if (existing && existing.userId !== userId) {
    throw new Error("Target profile belongs to another user")
  }
  const values = {
    publicId: profile.publicId,
    userId,
    name: profile.name,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    deletedAt: undefined,
  }
  const profileId = existing
    ? existing._id
    : await ctx.db.insert("mailAccountProfiles", values)
  if (existing) await ctx.db.patch(existing._id, values)

  const members = await ctx.db
    .query("mailAccountProfileMembers")
    .withIndex("by_profile", (queryBuilder) =>
      queryBuilder.eq("profileId", profileId)
    )
    .collect()
  for (const member of members) await ctx.db.delete(member._id)
  for (const [sortOrder, publicId] of profile.accountPublicIds.entries()) {
    const accountId = accountIds.get(publicId)
    if (!accountId) throw new Error(`Unknown profile account ${publicId}`)
    await ctx.db.insert("mailAccountProfileMembers", {
      profileId,
      accountId,
      profileAccountKey: `${profileId}:${accountId}`,
      sortOrder,
      createdAt: profile.createdAt,
    })
  }
}

async function upsertPushSubscription(
  ctx: MutationCtx,
  userId: Id<"users">,
  subscription: {
    endpoint: string
    p256dh: string
    auth: string
    expirationTime?: number
    userAgent?: string
    createdAt: number
    updatedAt: number
  }
) {
  const existing = await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_endpoint", (queryBuilder) =>
      queryBuilder.eq("endpoint", subscription.endpoint)
    )
    .unique()
  if (existing && existing.userId !== userId) {
    throw new Error("Target push subscription belongs to another user")
  }
  const values = { userId, ...subscription }
  if (existing) {
    await ctx.db.patch(existing._id, values)
    return existing._id
  }
  return await ctx.db.insert("pushSubscriptions", values)
}
