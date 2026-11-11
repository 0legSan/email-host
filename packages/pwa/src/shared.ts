export type WebPushPayload = {
  type: string
  title: string
  body: string
  url: string
  tag: string
  messageId?: string | null
  unreadCount?: number | null
  [key: string]: unknown
}

export const closeNotificationsMessageType = "pwa:close-notifications"

export function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index)
  }

  return output
}
