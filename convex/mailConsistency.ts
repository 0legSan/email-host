import { v } from "convex/values"

import { internalMutation } from "./_generated/server"
import { synchronizeMessageListEntryFlags } from "./lib/mailListEntryFlags"

const repairBatchSize = 500

export const repairListEntryFlagConsistency = internalMutation({
  args: {
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("mailListEntries")
      .paginate({ cursor: args.cursor ?? null, numItems: repairBatchSize })
    const processedMessageIds = new Set<string>()
    let updatedEntries = 0
    let updatedMailboxes = 0

    for (const entry of page.page) {
      if (processedMessageIds.has(entry.messageId)) continue
      processedMessageIds.add(entry.messageId)

      const message = await ctx.db.get(entry.messageId)
      if (!message || message.deletedAt !== undefined) continue

      const result = await synchronizeMessageListEntryFlags(
        ctx,
        message._id,
        message.flags,
        Date.now()
      )
      updatedEntries += result.updatedEntries
      updatedMailboxes += result.updatedMailboxes
    }

    return {
      cursor: page.continueCursor,
      done: page.isDone,
      scannedEntries: page.page.length,
      updatedEntries,
      updatedMailboxes,
    }
  },
})
