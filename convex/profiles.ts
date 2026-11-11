import { query } from "./_generated/server"
import { getCurrentUser } from "./lib/auth"

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const profiles = await ctx.db
      .query("mailAccountProfiles")
      .withIndex("by_user", (queryBuilder) =>
        queryBuilder.eq("userId", user._id)
      )
      .collect()

    return await Promise.all(
      profiles
        .filter((profile) => profile.deletedAt === undefined)
        .map(async (profile) => {
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
              account.userId === user._id &&
              account.deletedAt === undefined
                ? [account.publicId]
                : []
            ),
          }
        })
    )
  },
})
