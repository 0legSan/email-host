import {
  cleanupOutdatedCaches,
  matchPrecache,
  precache,
  type PrecacheEntry,
} from "workbox-precaching"

import {
  closeNotificationsMessageType,
  urlBase64ToUint8Array,
  type WebPushPayload,
} from "./shared"

type ServiceWorkerScope = ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

type NotificationAction = {
  action: string
  title: string
}

type NotificationOptionsWithActions = NotificationOptions & {
  actions?: NotificationAction[]
}

type ServiceWorkerMessage = {
  type: string
  url: string
  messageId: string | null
  [key: string]: unknown
}

type NotificationClickContext = {
  action: string
  payload: WebPushPayload
  url: string
  broadcast: (message: ServiceWorkerMessage) => Promise<void>
  openWindow: (url: string) => Promise<WindowClient | undefined>
  syncBadge: () => Promise<void>
}

export type PwaServiceWorkerOptions = {
  fallbackPayload: WebPushPayload
  notification: {
    icon: string
    badge?: string
    prepare?: () => void | Promise<void>
    actions?: (payload: WebPushPayload) => NotificationAction[] | undefined
  }
  api?: Partial<{
    prefix: string
    publicKey: string
    subscriptions: string
    badge: string
  }>
  cache?: Partial<{
    documentFallbackUrl: string
    legacyNames: string[]
    staticPathPrefixes: string[]
  }>
  onNotificationClick?: (
    context: NotificationClickContext
  ) => boolean | Promise<boolean>
  onPush?: (payload: WebPushPayload) => void | Promise<void>
}

const staticDestinations = new Set([
  "font",
  "image",
  "manifest",
  "script",
  "style",
  "worker",
])

export function installPwaServiceWorker(
  scope: ServiceWorkerScope,
  options: PwaServiceWorkerOptions,
  manifest: Array<PrecacheEntry | string>
) {
  const api = {
    prefix: "/api/",
    publicKey: "/api/push/vapid-public-key",
    subscriptions: "/api/push/subscriptions",
    badge: "/api/push/badge",
    ...options.api,
  }
  const cache = {
    documentFallbackUrl: "/index.html",
    legacyNames: [] as string[],
    staticPathPrefixes: ["/assets/", "/icons/"],
    ...options.cache,
  }

  cleanupOutdatedCaches()
  precache(manifest)

  scope.addEventListener("activate", (event) => {
    event.waitUntil(activateServiceWorker())
  })

  scope.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") {
      event.waitUntil(scope.skipWaiting())
      return
    }

    if (event.data?.type === closeNotificationsMessageType) {
      event.waitUntil(
        closeNotifications(readStringArray(event.data, "messageIds"))
      )
    }
  })

  scope.addEventListener("fetch", (event) => {
    const { request } = event

    if (request.method !== "GET") {
      return
    }

    const url = new URL(request.url)

    if (
      url.origin !== scope.location.origin ||
      url.pathname.startsWith(api.prefix)
    ) {
      return
    }

    if (request.mode === "navigate") {
      event.respondWith(precacheFirstDocument(request))
      return
    }

    if (isStaticRequest(request, url)) {
      event.respondWith(precacheFirst(request))
    }
  })

  scope.addEventListener("push", (event) => {
    event.waitUntil(showPushNotification(event.data))
  })

  async function showPushNotification(data: PushMessageData | null) {
    await options.notification.prepare?.()
    const payload = parsePushPayload(data)
    const notificationOptions: NotificationOptionsWithActions = {
      body: payload.body,
      tag: payload.tag,
      icon: options.notification.icon,
      badge: options.notification.badge,
      actions: options.notification.actions?.(payload),
      data: payload,
    }

    await Promise.all([
      options.onPush?.(payload),
      checkForReleaseUpdate(payload),
      updateAppBadgeAndBroadcast(payload),
      scope.registration.showNotification(payload.title, notificationOptions),
    ])
  }

  scope.addEventListener("pushsubscriptionchange", (event) => {
    event.waitUntil(refreshPushSubscription())
  })

  scope.addEventListener("notificationclick", (event) => {
    event.notification.close()
    const payload = parseNotificationData(event.notification.data)
    const url = new URL(payload.url, scope.location.origin).href

    event.waitUntil(handleNotificationClick(event.action, payload, url))
  })

  async function clearLegacyCaches() {
    const legacyNames = new Set(cache.legacyNames)
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames
        .filter((cacheName) => legacyNames.has(cacheName))
        .map((cacheName) => caches.delete(cacheName))
    )
  }

  async function activateServiceWorker() {
    await Promise.all([clearLegacyCaches(), scope.clients.claim()])

    const windows = await scope.clients.matchAll({ type: "window" })
    await Promise.all(
      windows.map((client) =>
        Promise.race([
          client.navigate(client.url).catch(() => undefined),
          new Promise<undefined>((resolve) =>
            setTimeout(() => resolve(undefined), 1_500)
          ),
        ])
      )
    )
  }

  async function precacheFirstDocument(request: Request) {
    return (
      (await matchPrecache(request)) ??
      (await matchPrecache(cache.documentFallbackUrl)) ??
      fetch(request)
    )
  }

  async function precacheFirst(request: Request) {
    return (await matchPrecache(request)) ?? fetch(request)
  }

  function isStaticRequest(request: Request, url: URL) {
    return (
      staticDestinations.has(request.destination) ||
      cache.staticPathPrefixes.some((prefix) =>
        url.pathname.startsWith(prefix)
      ) ||
      url.pathname.endsWith(".webmanifest")
    )
  }

  function parsePushPayload(data: PushMessageData | null) {
    if (!data) {
      return options.fallbackPayload
    }

    try {
      return normalizePayload(data.json())
    } catch {
      return options.fallbackPayload
    }
  }

  function normalizePayload(value: unknown): WebPushPayload {
    const record = readRecord(value)
    const fallback = options.fallbackPayload

    return {
      ...fallback,
      ...record,
      title: readString(record, "title") ?? fallback.title,
      body: readString(record, "body") ?? fallback.body,
      type: readString(record, "type") ?? fallback.type,
      url: readString(record, "url") ?? fallback.url,
      tag: readString(record, "tag") ?? fallback.tag,
      messageId: readString(record, "messageId"),
      unreadCount: readNonNegativeInteger(record?.unreadCount),
    }
  }

  function parseNotificationData(value: unknown) {
    return normalizePayload(value)
  }

  async function broadcast(payload: WebPushPayload) {
    await broadcastMessage({
      ...payload,
      messageId:
        typeof payload.messageId === "string" ? payload.messageId : null,
      type: payload.type,
      url: payload.url,
    })
  }

  async function broadcastMessage(message: ServiceWorkerMessage) {
    const windows = await scope.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    })
    await Promise.all(windows.map((client) => client.postMessage(message)))
  }

  async function closeNotifications(messageIds: string[]) {
    if (messageIds.length === 0) return

    const ids = new Set(messageIds)
    const notifications = await scope.registration.getNotifications()
    for (const notification of notifications) {
      const messageId = readString(readRecord(notification.data), "messageId")
      if (messageId && ids.has(messageId)) {
        notification.close()
      }
    }
  }

  async function checkForReleaseUpdate(payload: WebPushPayload) {
    if (payload.type !== "app:update") {
      return
    }

    try {
      await scope.registration.update()
    } catch {
      return undefined
    }
  }

  async function updateAppBadge(payload: WebPushPayload) {
    if (payload.unreadCount === null || payload.unreadCount === undefined) {
      return
    }

    await setAppBadge(payload.unreadCount)
  }

  async function updateAppBadgeAndBroadcast(payload: WebPushPayload) {
    // An open app must receive the event after the push badge update so its
    // newer local state can win instead of being overwritten by stale payload.
    await updateAppBadge(payload)
    await broadcast(payload)
  }

  async function handleNotificationClick(
    action: string,
    payload: WebPushPayload,
    url: string
  ) {
    const handled = await options.onNotificationClick?.({
      action,
      payload,
      url,
      broadcast: broadcastMessage,
      openWindow,
      syncBadge,
    })

    if (handled) {
      return
    }

    if (payload.type === "app:update") {
      await downloadAppUpdate(url)
      return
    }

    await openWindow(url)
  }

  async function downloadAppUpdate(url: string) {
    try {
      const registration = await scope.registration.update()
      registration.waiting?.postMessage({ type: "SKIP_WAITING" })
    } catch {
      return openWindow(url)
    }

    return openWindow(url)
  }

  async function syncBadge() {
    try {
      const response = await fetch(api.badge, { credentials: "include" })

      if (!response.ok) {
        return
      }

      const body: unknown = await response.json()
      const unreadCount = readNonNegativeInteger(readApiData(body)?.unreadCount)

      if (unreadCount !== null) {
        await setAppBadge(unreadCount)
      }
    } catch {
      return undefined
    }
  }

  async function setAppBadge(count: number) {
    try {
      if (count > 0) {
        await scope.navigator.setAppBadge(count)
      } else {
        await scope.navigator.clearAppBadge()
      }
    } catch {
      return undefined
    }
  }

  async function refreshPushSubscription() {
    try {
      const response = await fetch(api.publicKey, { credentials: "include" })

      if (!response.ok) {
        return
      }

      const publicKey = readString(
        readApiData(await response.json()),
        "publicKey"
      )

      if (!publicKey) {
        return
      }

      const existing = await scope.registration.pushManager.getSubscription()
      const subscription =
        existing ??
        (await scope.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }))

      await fetch(api.subscriptions, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      })
    } catch {
      return undefined
    }
  }

  async function openWindow(url: string) {
    const targetUrl = new URL(url, scope.location.origin).href
    const openedClient =
      (await scope.clients.openWindow(targetUrl)) ?? undefined

    if (openedClient) {
      return openedClient.focus()
    }

    const windows = await scope.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    })

    for (const client of windows) {
      if (new URL(client.url).origin === scope.location.origin) {
        await client.focus()
        return (await client.navigate(targetUrl)) ?? undefined
      }
    }
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

function readStringArray(
  record: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = record?.[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function readNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null
}

function readApiData(value: unknown) {
  const record = readRecord(value)
  return readRecord(record?.data)
}
