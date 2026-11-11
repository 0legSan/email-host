import { closeNotificationsMessageType, urlBase64ToUint8Array } from "./shared"

export type PushSubscriptionState =
  "checking" | "unsupported" | "default" | "granted" | "denied" | "subscribed"

export type PushSubscriptionDto = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

type Request = <T>(path: string, init?: RequestInit) => Promise<T>

type WebPushClientOptions = {
  request: Request
  operationTimeoutMs?: number
  endpoints?: Partial<{
    publicKey: string
    subscriptions: string
    test: string
  }>
}

const defaultEndpoints = {
  publicKey: "/api/push/vapid-public-key",
  subscriptions: "/api/push/subscriptions",
  test: "/api/push/test",
}

export function createWebPushClient(options: WebPushClientOptions) {
  const endpoints = { ...defaultEndpoints, ...options.endpoints }
  const timeoutMs = options.operationTimeoutMs ?? 20_000

  const requestWithTimeout = <T>(
    path: string,
    init: RequestInit | undefined,
    timeoutMessage: string
  ) => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

    return options
      .request<T>(path, { ...init, signal: controller.signal })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error(timeoutMessage)
        }

        throw error
      })
      .finally(() => window.clearTimeout(timeoutId))
  }

  const withTimeout = <T>(promise: Promise<T>, message: string) => {
    let timeoutId: number | null = null
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    })

    return Promise.race([promise, timeout]).finally(() => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    })
  }

  const getRegistration = async () => {
    const registration = await withTimeout(
      navigator.serviceWorker.ready,
      "Service worker не готов для push-уведомлений"
    )

    if (!("pushManager" in registration) || !registration.pushManager) {
      throw new Error("Push-уведомления не поддерживаются этим браузером")
    }

    return registration
  }

  const getCurrentState = async (): Promise<PushSubscriptionState> => {
    if (!isWebPushSupported()) {
      return "unsupported"
    }

    const registration = await getRegistration().catch(() => null)

    if (!registration) {
      return "unsupported"
    }

    const subscription = await withTimeout(
      registration.pushManager.getSubscription(),
      "Не удалось проверить текущую push-подписку"
    ).catch(() => null)

    return subscription ? "subscribed" : Notification.permission
  }

  const ensureSubscription = async (
    reportProgress: (message: string) => void = () => undefined
  ) => {
    reportProgress("Получаю push-ключ сервера")
    const { publicKey } = await requestWithTimeout<{ publicKey: string }>(
      endpoints.publicKey,
      undefined,
      "Сервер не ответил на запрос push-ключа"
    )
    reportProgress("Жду service worker")
    const registration = await getRegistration()
    reportProgress("Проверяю push-подписку браузера")
    const existing = await withTimeout(
      registration.pushManager.getSubscription(),
      "Не удалось проверить текущую push-подписку"
    )
    const subscription =
      existing ??
      (await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }),
        "Браузер не создал push-подписку"
      ))

    reportProgress("Сохраняю push-подписку на сервере")
    await requestWithTimeout<{ subscribed: true }>(
      endpoints.subscriptions,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      },
      "Сервер не сохранил push-подписку"
    )
  }

  return {
    async getCurrentState() {
      return getCurrentState()
    },
    async getSyncedState() {
      const state = await getCurrentState()

      if (!isWebPushSupported() || Notification.permission !== "granted") {
        return state
      }

      try {
        await ensureSubscription()
        return "subscribed" as const
      } catch (error) {
        console.warn("Push subscription sync failed", error)
        return state
      }
    },
    async subscribe(
      reportProgress: (message: string) => void = () => undefined
    ) {
      if (!isWebPushSupported()) {
        throw new Error("Push-уведомления не поддерживаются этим браузером")
      }
      if (Notification.permission === "denied") {
        throw new Error("Уведомления заблокированы в настройках браузера")
      }

      reportProgress("Запрашиваю разрешение браузера")
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await withTimeout(
              Notification.requestPermission(),
              "Браузер не завершил запрос разрешения на уведомления"
            )

      if (permission !== "granted") {
        reportProgress("Браузер не выдал разрешение на уведомления")
        return false
      }

      await ensureSubscription(reportProgress)
      return true
    },
    sendTest() {
      return requestWithTimeout<{ sent: number }>(
        endpoints.test,
        { method: "POST" },
        "Сервер не ответил на проверочный push"
      )
    },
    async unsubscribe() {
      if (!isWebPushSupported()) {
        return
      }

      const registration = await getRegistration()
      const subscription = await withTimeout(
        registration.pushManager.getSubscription(),
        "Не удалось проверить текущую push-подписку"
      )

      if (!subscription) {
        return
      }

      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      await options.request<{ subscribed: false }>(endpoints.subscriptions, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint }),
      })
    },
  }
}

export function isWebPushSupported() {
  return (
    "Notification" in window &&
    "PushManager" in window &&
    "serviceWorker" in navigator
  )
}

export function isPwaMessageOfType(
  data: unknown,
  type: string
): data is { type: string } & Record<string, unknown> {
  return (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    data.type === type
  )
}

export async function closeMailNotifications(messageIds: Iterable<string>) {
  if (!("serviceWorker" in navigator)) {
    return
  }

  const ids = [...new Set(messageIds)]
  if (ids.length === 0) {
    return
  }

  try {
    const idSet = new Set(ids)
    const registrations = await navigator.serviceWorker.getRegistrations()

    await Promise.all(
      registrations.map(async (registration) => {
        registration.active?.postMessage({
          type: closeNotificationsMessageType,
          messageIds: ids,
        })

        const notifications = await registration.getNotifications()
        for (const notification of notifications) {
          const data = notification.data as { messageId?: unknown } | null
          if (
            typeof data?.messageId === "string" &&
            idSet.has(data.messageId)
          ) {
            notification.close()
          }
        }
      })
    )
  } catch {
    return
  }
}
