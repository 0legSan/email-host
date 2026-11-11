import { ConvexError } from "convex/values"

import type { Doc } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"

export async function getCurrentUser(ctx: QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    throw new ConvexError("unauthorized")
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_public_id", (queryBuilder) =>
      queryBuilder.eq("publicId", identity.subject)
    )
    .unique()

  if (!user || user.deletedAt !== undefined) {
    throw new ConvexError("unauthorized")
  }

  return user
}

export async function getOwner(ctx: QueryCtx): Promise<Doc<"users">> {
  const user = await getCurrentUser(ctx)

  if (user.role !== "owner") {
    throw new ConvexError("forbidden")
  }

  return user
}

export function toUserDto(user: Doc<"users">) {
  return {
    id: user.publicId,
    email: user.email,
    role: user.role,
    displayName: user.displayName ?? null,
  }
}
