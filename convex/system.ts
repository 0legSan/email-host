import { v } from "convex/values"

import { internalMutation, internalQuery, query } from "./_generated/server"

export const health = query({
  args: {},
  handler: () => ({
    status: "ok" as const,
  }),
})

export const setValue = internalMutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("systemState")
      .withIndex("by_key", (queryBuilder) => queryBuilder.eq("key", args.key))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: Date.now(),
      })
      return existing._id
    }

    return await ctx.db.insert("systemState", {
      key: args.key,
      value: args.value,
      updatedAt: Date.now(),
    })
  },
})

export const getValue = internalQuery({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("systemState")
      .withIndex("by_key", (queryBuilder) => queryBuilder.eq("key", args.key))
      .unique()
  },
})
