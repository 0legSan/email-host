import { mailText } from "@workspace/mail-design/locale"
import type { PushSubscriptionState } from "@workspace/pwa/client"

const unavailable = async (): Promise<PushSubscriptionState> => "unsupported"

// A demo must never ask for system permissions or create a real push subscription.
export const webPushClient = {
  getSyncedState: unavailable,
  getCurrentState: unavailable,
  unsubscribe: async () => undefined,
  subscribe: async () => {
    throw new Error(
      mailText(
        "Push-уведомления доступны в собственном экземпляре Email Host. Демо работает только с локальными данными.",
        "Push notifications are available in your own Email Host instance. The demo uses local data only."
      )
    )
  },
  sendTest: async () => ({ sent: 0 }),
}
