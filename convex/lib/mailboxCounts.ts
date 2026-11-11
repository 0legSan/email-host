import type { Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

type MailboxCountDelta = {
  total: number
  unread: number
}

export async function applyMailboxCountDelta(
  ctx: MutationCtx,
  mailboxId: Id<"mailboxes">,
  delta: MailboxCountDelta,
  now: number
) {
  const mailbox = await ctx.db.get(mailboxId)
  if (!mailbox) return false

  await ctx.db.patch(mailbox._id, {
    messagesTotal: Math.max(0, (mailbox.messagesTotal ?? 0) + delta.total),
    messagesUnread: Math.max(0, (mailbox.messagesUnread ?? 0) + delta.unread),
    updatedAt: now,
  })
  return true
}
