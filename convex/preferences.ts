import { query } from "./_generated/server"
import { getCurrentUser } from "./lib/auth"

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

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const preferences = await ctx.db
      .query("userMailPreferences")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", user._id)
      )
      .unique()

    return {
      sidebar: {
        order: preferences?.sidebarOrder ?? [],
      },
      signatures: preferences?.signatures ?? emptySignatures,
    }
  },
})
