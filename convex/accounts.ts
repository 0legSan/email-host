import { query } from "./_generated/server"
import { getCurrentUser } from "./lib/auth"

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const accounts = await ctx.db
      .query("mailAccounts")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", user._id)
      )
      .collect()
    const activeAccounts = accounts.filter(
      (account) => account.deletedAt === undefined
    )

    return await Promise.all(
      activeAccounts.map(async (account) => {
        const credentials = await ctx.db
          .query("mailAccountCredentials")
          .withIndex("by_account", (queryBuilder) =>
            queryBuilder.eq("accountId", account._id)
          )
          .unique()

        return {
          id: account.publicId,
          provider: account.provider,
          address: account.address,
          label: account.label ?? null,
          displayName: account.displayName ?? null,
          connectionStatus: credentials
            ? account.connectionStatus
            : ("connect_error" as const),
          syncStatus: credentials ? account.syncStatus : ("paused" as const),
          lastSyncAt:
            account.lastSyncAt === undefined
              ? null
              : new Date(account.lastSyncAt).toISOString(),
          lastError: account.lastError ?? null,
        }
      })
    )
  },
})
