import {
  installPwaServiceWorker,
  type PwaServiceWorkerOptions,
} from "@workspace/pwa/service-worker"

import {
  handleMailNotificationClick,
  readNotificationAction,
} from "./lib/mail-notification-click"
import {
  createOfflineMailStores,
  offlineMailDatabaseName,
  offlineMailDatabaseVersion,
} from "./lib/offline-mail-schema"

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ revision: string | null; url: string } | string>
}

type PushedMessage = {
  id: string
  sentAt: string | null
  bodyStatus: string
  [key: string]: unknown
}

type OfflineCacheSettings = {
  enabled: boolean
  messageMode: "opened" | "recent-and-opened"
}
let notificationLocale: "ru" | "en" = "ru"

const options: PwaServiceWorkerOptions = {
  fallbackPayload: {
    get title() {
      return notificationLocale === "en" ? "New email" : "Новое письмо"
    },
    get body() {
      return notificationLocale === "en"
        ? "Open Email Host to read your email."
        : "Откройте Email Host, чтобы прочитать письмо."
    },
    type: "mail:new",
    url: "/",
    tag: "mail:new",
    messageId: null,
    unreadCount: null,
  },
  notification: {
    prepare: loadNotificationLanguage,
    icon: "/icons/icon-192-v2.png",
    badge: "/icons/notification-badge-v2.png",
    actions: (payload) =>
      payload.type === "mail:new" && payload.messageId
        ? [
            {
              action: readNotificationAction,
              title: notificationLocale === "en" ? "Mark as read" : "Прочитать",
            },
          ]
        : undefined,
  },
  cache: {
    legacyNames: ["email-host-shell-v1", "email-host-runtime-v1"],
  },
  async onPush(payload) {
    if (payload.type !== "mail:new" || !payload.messageId) return
    await cachePushedMessage(payload.messageId)
  },
  onNotificationClick: handleMailNotificationClick,
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

installPwaServiceWorker(self, options, self.__WB_MANIFEST)

async function loadNotificationLanguage() {
  try {
    const database = await openOfflineDatabase()
    try {
      const preference = await readRecord<{ locale: unknown }>(
        database,
        "metadata",
        "language"
      )
      notificationLocale = preference?.locale === "en" ? "en" : "ru"
    } finally {
      database.close()
    }
  } catch {
    // Notification delivery remains available when browser storage is blocked.
    notificationLocale = "ru"
  }
}

async function cachePushedMessage(messageId: string) {
  const database = await openOfflineDatabase()
  try {
    const settings = await readRecord<{
      settings: OfflineCacheSettings
    }>(database, "metadata", "settings")
    if (
      !settings?.settings.enabled ||
      settings.settings.messageMode !== "recent-and-opened"
    ) {
      return
    }

    const response = await fetch(
      `/api/mail/messages/${encodeURIComponent(messageId)}`,
      { credentials: "include" }
    )
    if (!response.ok) return
    const payload = (await response.json()) as {
      ok?: boolean
      data?: { message?: PushedMessage }
    }
    const message = payload.data?.message
    if (!payload.ok || !message || message.bodyStatus !== "loaded") return

    const current = await readRecord<{
      cachedAt: string
      openedAt: string | null
      source: "opened" | "recent"
    }>(database, "messageDetails", message.id)
    const now = new Date().toISOString()
    await writeRecord(database, "messageDetails", {
      id: message.id,
      message,
      cachedAt: current?.cachedAt ?? now,
      openedAt: current?.openedAt ?? null,
      sentAt: message.sentAt,
      source: current?.source === "opened" ? "opened" : "recent",
      updatedAt: now,
    })
  } finally {
    database.close()
  }
}

function openOfflineDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      offlineMailDatabaseName,
      offlineMailDatabaseVersion
    )
    request.onupgradeneeded = () => {
      createOfflineMailStores(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

function readRecord<T>(
  database: IDBDatabase,
  storeName: "metadata" | "messageDetails",
  key: IDBValidKey
) {
  return new Promise<T | null>((resolve, reject) => {
    const request = database
      .transaction(storeName, "readonly")
      .objectStore(storeName)
      .get(key) as IDBRequest<T | undefined>
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result ?? null)
  })
}

function writeRecord(
  database: IDBDatabase,
  storeName: "messageDetails",
  value: object
) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite")
    transaction.objectStore(storeName).put(value)
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => resolve()
  })
}
