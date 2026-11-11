import * as webPush from "web-push"

export type { WebPushPayload } from "./shared"
import type { WebPushPayload } from "./shared"

type WebPushSenderOptions<T> = {
  vapid: {
    subject: string
    publicKey: string
    privateKey: string
  }
  onGone: (subscription: T) => Promise<void>
  toSubscription: (subscription: T) => webPush.PushSubscription
  onError?: (error: unknown, subscription: T) => void
  ttl?: number
  urgency?: "very-low" | "low" | "normal" | "high"
}

export class WebPushSender<T> {
  private readonly options: WebPushSenderOptions<T>

  constructor(options: WebPushSenderOptions<T>) {
    this.options = options
  }

  async send(subscriptions: T[], payload: WebPushPayload) {
    await Promise.all(
      subscriptions.map((subscription) => this.sendOne(subscription, payload))
    )
  }

  private async sendOne(subscription: T, payload: WebPushPayload) {
    try {
      await webPush.sendNotification(
        this.options.toSubscription(subscription),
        JSON.stringify(payload),
        {
          TTL: this.options.ttl ?? 86_400,
          urgency: this.options.urgency ?? "normal",
          vapidDetails: this.options.vapid,
        }
      )
    } catch (error) {
      if (isGoneSubscriptionError(error)) {
        await this.options.onGone(subscription)
        return
      }

      this.options.onError?.(error, subscription)
    }
  }
}

function isGoneSubscriptionError(error: unknown) {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) {
    return false
  }

  const statusCode = (error as { statusCode: unknown }).statusCode
  return statusCode === 404 || statusCode === 410
}
