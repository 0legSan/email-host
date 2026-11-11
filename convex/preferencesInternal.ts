import { v } from "convex/values"

import { internalMutation, internalQuery } from "./_generated/server"

const emptySignatures = {
  defaultId: null,
  defaults: {
    global: {
      new: null,
      reply: null,
      forward: null,
    },
    accounts: {},
  },
  items: [],
}

export const get = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const preferences = await ctx.db
      .query("userMailPreferences")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", args.userId)
      )
      .unique()

    return {
      sidebarOrder: preferences?.sidebarOrder ?? [],
      signatures: preferences?.signatures ?? emptySignatures,
    }
  },
})

export const getOwnership = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const [accounts, profiles] = await Promise.all([
      ctx.db
        .query("mailAccounts")
        .withIndex("by_user", (queryBuilder) =>
          queryBuilder.eq("userId", args.userId)
        )
        .collect(),
      ctx.db
        .query("mailAccountProfiles")
        .withIndex("by_user", (queryBuilder) =>
          queryBuilder.eq("userId", args.userId)
        )
        .collect(),
    ])

    return {
      accounts: accounts
        .filter((account) => account.deletedAt === undefined)
        .map((account) => ({
          id: account.publicId,
          address: account.address,
          displayName: account.displayName ?? null,
        })),
      profiles: profiles
        .filter((profile) => profile.deletedAt === undefined)
        .map((profile) => profile.publicId),
    }
  },
})

export const save = internalMutation({
  args: {
    userId: v.id("users"),
    sidebarOrder: v.any(),
    signatures: v.any(),
  },
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("userMailPreferences")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", args.userId)
      )
      .unique()
    const now = Date.now()

    if (current) {
      await ctx.db.patch(current._id, {
        sidebarOrder: args.sidebarOrder,
        signatures: args.signatures,
        updatedAt: now,
      })
      return
    }

    await ctx.db.insert("userMailPreferences", {
      userId: args.userId,
      sidebarOrder: args.sidebarOrder,
      signatures: args.signatures,
      createdAt: now,
      updatedAt: now,
    })
  },
})
