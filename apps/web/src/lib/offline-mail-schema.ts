import { mailStorageKey } from "./mail-storage-namespace"

export const offlineMailDatabaseName = mailStorageKey(
  "email-host-offline-cache"
)
// Version 3 could be created by a push worker with only two stores.
export const offlineMailDatabaseVersion = 4

export type OfflineMailStoreName =
  | "metadata"
  | "messageLists"
  | "messageDetails"
  | "messageThreads"
  | "messageMutations"

export function createOfflineMailStores(database: IDBDatabase) {
  const stores: Array<[OfflineMailStoreName, string]> = [
    ["metadata", "key"],
    ["messageLists", "key"],
    ["messageDetails", "id"],
    ["messageThreads", "id"],
    ["messageMutations", "messageId"],
  ]

  for (const [name, keyPath] of stores) {
    if (!database.objectStoreNames.contains(name)) {
      database.createObjectStore(name, { keyPath })
    }
  }
}
