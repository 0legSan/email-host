import { query } from "./_generated/server"
import { getCurrentUser, toUserDto } from "./lib/auth"

export const me = query({
  args: {},
  handler: async (ctx) => {
    return toUserDto(await getCurrentUser(ctx))
  },
})
