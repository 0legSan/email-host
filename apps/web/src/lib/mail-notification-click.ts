export const readNotificationAction = "read"

export type MailNotificationClickContext = {
  action: string
  payload: {
    type: string
    messageId?: unknown
  }
  url: string
  broadcast: (message: {
    type: string
    url: string
    messageId: string | null
  }) => Promise<void>
  syncBadge: () => Promise<void>
}

export async function handleMailNotificationClick(
  context: MailNotificationClickContext,
  request: typeof fetch = fetch
) {
  if (
    context.action !== readNotificationAction ||
    context.payload.type !== "mail:new" ||
    typeof context.payload.messageId !== "string"
  ) {
    return false
  }

  const messageId = context.payload.messageId

  try {
    const response = await request(
      `/api/mail/messages/${encodeURIComponent(messageId)}`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seen: true }),
      }
    )

    if (response.ok) {
      await Promise.all([
        context.syncBadge(),
        context.broadcast({
          messageId,
          type: "mail:new",
          url: context.url,
        }),
      ])
    }
  } catch {
    // Нажатие на action не должно превращаться в открытие письма при сбое сети.
  }

  return true
}
