import { WebPushSender, type WebPushPayload } from "@workspace/pwa/server"

import { internal } from "../../../../convex/_generated/api"
import type { Doc, Id } from "../../../../convex/_generated/dataModel"
import type { MailAgentConfig } from "../config"
import type { PushSubscriptionDto } from "../contracts"
import type { MailAgentConvexClient } from "../convex/client"
import { normalizeMailPreviewText } from "../mail-content"
import { ReactiveWorkerScheduler } from "./reactive-worker-scheduler"

const maxEventAttempts = 8
const staleLockMs = 5 * 60 * 1000

type WebPushVapidConfig = {
  subject: string
  publicKey: string
  privateKey: string
}

export class PushNotificationService {
  private readonly convex: MailAgentConvexClient
  private readonly vapidConfig: WebPushVapidConfig | null
  private readonly sender: WebPushSender<Doc<"pushSubscriptions">> | null
  private readonly scheduler: ReactiveWorkerScheduler
  private unsubscribe: (() => void) | null = null

  constructor(convex: MailAgentConvexClient, config: MailAgentConfig) {
    this.convex = convex
    this.vapidConfig = getWebPushVapidConfig(config)
    this.sender = this.vapidConfig
      ? new WebPushSender({
          vapid: this.vapidConfig,
          toSubscription,
          onGone: async (subscription) => {
            await this.convex.mutation(
              internal.pushInternal.removeSubscription,
              { subscriptionId: subscription._id }
            )
          },
          onError: (error) => {
            console.error(
              "Web push delivery failed",
              error instanceof Error ? error.message : String(error)
            )
          },
        })
      : null
    this.scheduler = new ReactiveWorkerScheduler(
      () => this.processEvents(),
      staleLockMs
    )
  }

  start() {
    if (this.unsubscribe || !this.sender) return
    this.unsubscribe = this.convex.subscribe(
      internal.pushInternal.getPushEventWakeState,
      {},
      (state) => this.scheduler.update(state),
      (error) => {
        console.error("Push event subscription failed", error.message)
      }
    )
  }

  stop() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.scheduler.stop()
  }

  getPublicKey() {
    return this.vapidConfig?.publicKey ?? null
  }

  isConfigured() {
    return Boolean(this.vapidConfig)
  }

  getUnreadCount(userId: Id<"users">) {
    return this.convex.query(internal.pushInternal.getUnreadCount, { userId })
  }

  saveSubscription(
    userId: Id<"users">,
    subscription: PushSubscriptionDto,
    userAgent: string | undefined
  ) {
    return this.convex.mutation(internal.pushInternal.saveSubscription, {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      expirationTime:
        typeof subscription.expirationTime === "number"
          ? subscription.expirationTime
          : undefined,
      userAgent,
    })
  }

  deleteSubscription(userId: Id<"users">, endpoint: string) {
    return this.convex.mutation(internal.pushInternal.deleteSubscription, {
      userId,
      endpoint,
    })
  }

  async notifyAppUpdate(version: string) {
    if (!this.sender) return false
    const created = await this.convex.mutation(
      internal.pushInternal.createReleaseNotification,
      { version }
    )
    if (!created) return false

    const subscriptions = await this.convex.query(
      internal.pushInternal.listSubscriptions,
      {}
    )
    await this.sender.send(subscriptions, buildAppUpdateWebPushPayload(version))
    return true
  }

  async notifyTest(userId: Id<"users">) {
    if (!this.sender) return null
    const subscriptions = await this.convex.query(
      internal.pushInternal.listSubscriptions,
      { userId }
    )
    if (subscriptions.length === 0) return 0
    await this.sender.send(subscriptions, buildTestWebPushPayload())
    return subscriptions.length
  }

  private async processEvents() {
    if (!this.sender) return

    try {
      const claimed = await this.convex.mutation(
        internal.pushInternal.claimEvents,
        { limit: 20, now: Date.now() }
      )
      await Promise.all(claimed.map((item) => this.processEvent(item)))
    } catch (error) {
      console.error(
        "Push event worker failed",
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  private async processEvent(item: {
    event: {
      _id: Id<"pushEvents">
      userId: Id<"users">
      payload: unknown
      attempts: number
    }
    account: { address: string } | null
    deliverable: boolean
  }) {
    const { event, account } = item
    try {
      if (!item.deliverable) {
        await this.finishEvent(event._id, "succeeded")
        return
      }

      const subscriptions = await this.convex.query(
        internal.pushInternal.listSubscriptions,
        { userId: event.userId }
      )
      if (subscriptions.length > 0) {
        const unreadCount = await this.getUnreadCount(event.userId)
        await this.sender?.send(
          subscriptions,
          buildNewMessageWebPushPayload(
            event.payload,
            account?.address ?? "",
            unreadCount
          )
        )
      }
      await this.finishEvent(event._id, "succeeded")
    } catch (error) {
      const failed = event.attempts >= maxEventAttempts
      await this.convex.mutation(internal.pushInternal.finishEvent, {
        eventId: event._id,
        status: failed ? "failed" : "retry",
        nextAttemptAt: failed
          ? undefined
          : Date.now() + Math.min(60 * 60 * 1000, 1_000 * 2 ** event.attempts),
        lastError: error instanceof Error ? error.message : String(error),
        now: Date.now(),
      })
    }
  }

  private finishEvent(
    eventId: Id<"pushEvents">,
    status: "succeeded" | "failed"
  ) {
    return this.convex.mutation(internal.pushInternal.finishEvent, {
      eventId,
      status,
      now: Date.now(),
    })
  }
}

function toSubscription(subscription: Doc<"pushSubscriptions">) {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  }
}

function buildAppUpdateWebPushPayload(version: string): WebPushPayload {
  return {
    type: "app:update",
    title: "Mail Host обновлен",
    body: `Доступна новая версия: ${version}`,
    url: "/mail",
    tag: `app:update:${version}`,
    messageId: null,
    unreadCount: null,
  }
}

function buildTestWebPushPayload(): WebPushPayload {
  return {
    type: "push:test",
    title: "Mail Host",
    body: "Проверочное push-уведомление доставлено.",
    url: "/mail",
    tag: `push:test:${Date.now()}`,
    messageId: null,
    unreadCount: null,
  }
}

function getWebPushVapidConfig(
  config: MailAgentConfig
): WebPushVapidConfig | null {
  if (!config.webPushVapidPublicKey || !config.webPushVapidPrivateKey) {
    return null
  }
  return {
    subject: config.webPushVapidSubject ?? `mailto:${config.ownerEmail}`,
    publicKey: config.webPushVapidPublicKey,
    privateKey: config.webPushVapidPrivateKey,
  }
}

function buildNewMessageWebPushPayload(
  value: unknown,
  accountAddress: string,
  unreadCount: number
): WebPushPayload {
  const data = readRecord(value)
  const subject = readString(data, "subject") ?? "Новое письмо"
  const from = readRecord(data?.from)
  const sender =
    readString(from, "name") ?? readString(from, "address") ?? accountAddress
  const snippet = normalizeMailPreviewText(readString(data, "snippet"))
  const messageId = readString(data, "id")
  const body = [sender ? `От: ${sender}` : null, snippet]
    .filter((part): part is string => Boolean(part))
    .join("\n")
  return {
    type: "mail:new",
    title: subject,
    body: body || "Откройте письмо, чтобы прочитать его.",
    url: messageId ? `/mail/message/${encodeURIComponent(messageId)}` : "/mail",
    tag: `mail:${accountAddress}:${messageId ?? Date.now()}`,
    messageId,
    unreadCount,
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function readString(
  record: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = record?.[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}
