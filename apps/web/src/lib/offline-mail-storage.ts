import type { MessageDto } from "./api-client"
import {
  createOfflineMailStores,
  offlineMailDatabaseName,
  offlineMailDatabaseVersion,
  type OfflineMailStoreName as StoreName,
} from "./offline-mail-schema"

type CachedMessageDetailRecord = {
  id: string
  message: MessageDto
  cachedAt: string
  openedAt: string | null
  sentAt: string | null
  source: "opened" | "recent"
  updatedAt: string
}

export type CachedMessageDetailMetadata = Omit<
  CachedMessageDetailRecord,
  "message"
>

let databasePromise: Promise<IDBDatabase> | null = null
let storageRevision = 0

export function getOfflineMailStorageRevision() {
  return storageRevision
}

export function isIndexedDbAvailable() {
  return typeof window !== "undefined" && "indexedDB" in window
}

export async function openDatabase() {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      offlineMailDatabaseName,
      offlineMailDatabaseVersion
    )

    request.onupgradeneeded = () => {
      createOfflineMailStores(request.result)
    }
    request.onerror = () => {
      databasePromise = null
      reject(request.error)
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = null
      }
      resolve(database)
    }
  }).catch((error: unknown) => {
    // indexedDB.open can also throw synchronously when browser storage is denied.
    databasePromise = null
    throw error
  })

  return databasePromise
}

export async function getRecord<T>(storeName: StoreName, key: IDBValidKey) {
  if (!isIndexedDbAvailable()) {
    return null
  }

  const db = await openDatabase()
  const transaction = db.transaction(storeName, "readonly")
  const record = await requestToPromise(
    transaction.objectStore(storeName).get(key) as IDBRequest<T | undefined>
  )

  return record ?? null
}

export async function getAllRecords<T>(storeName: StoreName) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, "readonly")

  return requestToPromise(
    transaction.objectStore(storeName).getAll() as IDBRequest<T[]>
  )
}

export async function getMessageDetailMetadata() {
  const db = await openDatabase()
  const transaction = db.transaction("messageDetails", "readonly")
  const request = transaction.objectStore("messageDetails").openCursor()

  return new Promise<CachedMessageDetailMetadata[]>((resolve, reject) => {
    const records: CachedMessageDetailMetadata[] = []

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const cursor = request.result

      if (!cursor) {
        resolve(records)
        return
      }

      const record = cursor.value as CachedMessageDetailRecord
      records.push({
        id: record.id,
        cachedAt: record.cachedAt,
        openedAt: record.openedAt,
        sentAt: record.sentAt,
        source: record.source,
        updatedAt: record.updatedAt,
      })
      cursor.continue()
    }
  })
}

export async function putRecord<T extends object>(
  storeName: StoreName,
  value: T
) {
  const db = await openDatabase()
  const transaction = db.transaction(storeName, "readwrite")
  const done = transactionDone(transaction)

  transaction.objectStore(storeName).put(value)
  await done
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

export function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
    transaction.oncomplete = () => {
      if (transaction.mode === "readwrite") storageRevision += 1
      resolve()
    }
  })
}
