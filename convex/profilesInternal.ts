import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { internalMutation, internalQuery } from "./_generated/server"

export const list = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const profiles = await ctx.db
      .query("mailAccountProfiles")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", args.userId)
      )
      .collect()

    return await Promise.all(
      profiles
        .filter((profile) => profile.deletedAt === undefined)
        .map((profile) => toProfileDto(ctx, profile, args.userId))
    )
  },
})

export const create = internalMutation({
  args: {
    userId: v.id("users"),
    publicId: v.string(),
    name: v.string(),
    accountPublicIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const accounts = await findOwnedAccounts(
      ctx,
      args.userId,
      args.accountPublicIds
    )
    if (!accounts) {
      return { ok: false as const }
    }

    const now = Date.now()
    const profileId = await ctx.db.insert("mailAccountProfiles", {
      publicId: args.publicId,
      userId: args.userId,
      name: args.name,
      createdAt: now,
      updatedAt: now,
    })
    await replaceMembers(ctx, profileId, accounts)
    const profile = await ctx.db.get(profileId)
    return {
      ok: true as const,
      profile: profile
        ? await toProfileDto(ctx, profile, args.userId)
        : null,
    }
  },
})

export const update = internalMutation({
  args: {
    userId: v.id("users"),
    publicId: v.string(),
    name: v.optional(v.string()),
    accountPublicIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const profile = await findOwnedProfile(ctx, args.userId, args.publicId)
    if (!profile) {
      return { ok: false as const, code: "not_found" as const }
    }

    if (args.name !== undefined) {
      await ctx.db.patch(profile._id, {
        name: args.name,
        updatedAt: Date.now(),
      })
    }

    if (args.accountPublicIds !== undefined) {
      const accounts = await findOwnedAccounts(
        ctx,
        args.userId,
        args.accountPublicIds
      )
      if (!accounts) {
        return { ok: false as const, code: "invalid_accounts" as const }
      }
      await replaceMembers(ctx, profile._id, accounts)
    }

    const updated = await ctx.db.get(profile._id)
    return {
      ok: true as const,
      profile: updated
        ? await toProfileDto(ctx, updated, args.userId)
        : null,
    }
  },
})

export const remove = internalMutation({
  args: {
    userId: v.id("users"),
    publicId: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await findOwnedProfile(ctx, args.userId, args.publicId)
    if (!profile) return false

    const members = await ctx.db
      .query("mailAccountProfileMembers")
      .withIndex("by_profile", (queryBuilder) =>
        queryBuilder.eq("profileId", profile._id)
      )
      .collect()
    for (const member of members) {
      await ctx.db.delete(member._id)
    }

    const now = Date.now()
    await ctx.db.patch(profile._id, {
      deletedAt: now,
      updatedAt: now,
    })
    return true
  },
})

async function findOwnedProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  publicId: string
) {
  const profile = await ctx.db
    .query("mailAccountProfiles")
    .withIndex("by_public_id", (queryBuilder) =>
      queryBuilder.eq("publicId", publicId)
    )
    .unique()
  return profile &&
    profile.userId === userId &&
    profile.deletedAt === undefined
    ? profile
    : null
}

async function findOwnedAccounts(
  ctx: MutationCtx,
  userId: Id<"users">,
  publicIds: string[]
): Promise<Doc<"mailAccounts">[] | null> {
  const uniquePublicIds = [...new Set(publicIds)]
  const accounts = await Promise.all(
    uniquePublicIds.map((publicId) =>
      ctx.db
        .query("mailAccounts")
        .withIndex("by_public_id", (queryBuilder) =>
          queryBuilder.eq("publicId", publicId)
        )
        .unique()
    )
  )

  if (
    accounts.some(
      (account) =>
        !account ||
        account.userId !== userId ||
        account.deletedAt !== undefined
    )
  ) {
    return null
  }

  return accounts as Doc<"mailAccounts">[]
}

async function replaceMembers(
  ctx: MutationCtx,
  profileId: Id<"mailAccountProfiles">,
  accounts: Doc<"mailAccounts">[]
) {
  const current = await ctx.db
    .query("mailAccountProfileMembers")
    .withIndex("by_profile", (queryBuilder) =>
      queryBuilder.eq("profileId", profileId)
    )
    .collect()
  for (const member of current) {
    await ctx.db.delete(member._id)
  }

  for (const [sortOrder, account] of accounts.entries()) {
    await ctx.db.insert("mailAccountProfileMembers", {
      profileId,
      accountId: account._id,
      profileAccountKey: `${profileId}:${account._id}`,
      sortOrder,
      createdAt: Date.now(),
    })
  }
}

async function toProfileDto(
  ctx: QueryCtx,
  profile: Doc<"mailAccountProfiles">,
  userId: Id<"users">
) {
  const members = await ctx.db
    .query("mailAccountProfileMembers")
    .withIndex("by_profile_order", (queryBuilder) =>
      queryBuilder.eq("profileId", profile._id)
    )
    .collect()
  const accounts = await Promise.all(
    members.map((member) => ctx.db.get(member.accountId))
  )
  return {
    id: profile.publicId,
    name: profile.name,
    accountIds: accounts.flatMap((account) =>
      account &&
      account.userId === userId &&
      account.deletedAt === undefined
        ? [account.publicId]
        : []
    ),
  }
}
