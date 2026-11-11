import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

type ListEntryFlags = Pick<Doc<"mailListEntries">, "flagged" | "seen">
type ListEntryFlagState<TMailboxId> = ListEntryFlags & {
  mailboxId: TMailboxId
  visible: boolean
}

export function planMessageListEntryFlagUpdates<
  TEntry extends ListEntryFlagState<unknown>,
>(entries: TEntry[], flags: ListEntryFlags) {
  const changedEntries = entries.filter(
    (entry) => entry.seen !== flags.seen || entry.flagged !== flags.flagged
  )
  const unreadDeltaByMailbox = new Map<TEntry["mailboxId"], number>()

  for (const entry of changedEntries) {
    if (!entry.visible || entry.seen === flags.seen) continue

    unreadDeltaByMailbox.set(
      entry.mailboxId,
      (unreadDeltaByMailbox.get(entry.mailboxId) ?? 0) + (flags.seen ? -1 : 1)
    )
  }

  return { changedEntries, unreadDeltaByMailbox }
}

export async function synchronizeMessageListEntryFlags(
  ctx: MutationCtx,
  messageId: Id<"mailMessages">,
  flags: ListEntryFlags,
  now: number
) {
  const entries = await ctx.db
    .query("mailListEntries")
    .withIndex("by_message", (queryBuilder) =>
      queryBuilder.eq("messageId", messageId)
    )
    .collect()
  const { changedEntries, unreadDeltaByMailbox } =
    planMessageListEntryFlagUpdates(entries, flags)

  for (const entry of changedEntries) {
    await ctx.db.patch(entry._id, {
      seen: flags.seen,
      flagged: flags.flagged,
      updatedAt: now,
    })
  }

  for (const [mailboxId, unreadDelta] of unreadDeltaByMailbox) {
    const mailbox = await ctx.db.get(mailboxId)
    if (!mailbox) continue

    await ctx.db.patch(mailbox._id, {
      messagesUnread: Math.max(0, (mailbox.messagesUnread ?? 0) + unreadDelta),
      updatedAt: now,
    })
  }

  return {
    updatedEntries: changedEntries.length,
    updatedMailboxes: unreadDeltaByMailbox.size,
  }
}
