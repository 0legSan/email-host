import type {
  BootstrapDto,
  MessageDto,
  MessageListItemDto,
  MessagePageDto,
  MessagePageRequest,
  MessageThreadDto,
} from "./api-client"
import {
  patchBootstrap,
  patchMessage,
  patchMessagePage,
  patchMessagePageStates,
  patchMessageState,
  patchMessageThread,
  patchMessageThreadStates,
} from "./offline-mail-mutations"
import {
  getAllRecords,
  getRecord,
  isIndexedDbAvailable,
  openDatabase,
  transactionDone,
} from "./offline-mail-storage"
import type {
  OfflineMailCacheSettings,
  PendingMessageMutation,
  PendingMessageMutationInput,
} from "./offline-mail-cache"

type CachedBootstrapRecord = {
  key: "bootstrap"
  data: BootstrapDto
  cachedAt: string
  updatedAt: string
}

type NormalizedMessagePageRequest = Omit<MessagePageRequest, "accountIds"> & {
  accountIds: string[] | null
}

type CachedMessageListRecord = {
  key: string
  request: NormalizedMessagePageRequest
  page: MessagePageDto
  cachedAt: string
  updatedAt: string
}

type CachedMessageDetailRecord = {
  id: string
  message: MessageDto
  cachedAt: string
  openedAt: string | null
  sentAt: string | null
  source: "opened" | "recent"
  updatedAt: string
}

type CachedMessageThreadRecord = {
  id: string
  thread: MessageThreadDto
  cachedAt: string
  updatedAt: string
}

const metadataBootstrapKey = "bootstrap"

function canUseOfflineMailCache(settings: OfflineMailCacheSettings) {
  return settings.enabled && isIndexedDbAvailable()
}

export async function persistPendingMessageMutation(
  input: PendingMessageMutationInput
) {
  const mutations = await persistPendingMessageMutations([input])
  return mutations[0] ?? null
}

export async function persistPendingMessageMutations(
  inputs: PendingMessageMutationInput[]
) {
  if (!isIndexedDbAvailable()) {
    return []
  }

  if (inputs.length === 0) {
    return []
  }

  const [currentMutations, bootstrapRecord, messageLists, messageThreads] =
    await Promise.all([
      getAllRecords<PendingMessageMutation>("messageMutations"),
      getRecord<CachedBootstrapRecord>("metadata", metadataBootstrapKey),
      getAllRecords<CachedMessageListRecord>("messageLists"),
      getAllRecords<CachedMessageThreadRecord>("messageThreads"),
    ])
  const now = new Date().toISOString()
  const currentMutationsById = new Map(
    currentMutations.map((mutation) => [mutation.messageId, mutation])
  )
  const inputsById = new Map(inputs.map((input) => [input.message.id, input]))
  const mutations = inputs.map((input) => {
    const currentMutation = currentMutationsById.get(input.message.id)

    return {
      messageId: input.message.id,
      clientMutationId: input.clientMutationId,
      accountId: input.message.accountId,
      path: input.message.path,
      previousSeen: currentMutation?.previousSeen ?? input.message.seen,
      flags: {
        ...currentMutation?.flags,
        ...input.flags,
      },
      createdAt: currentMutation?.createdAt ?? now,
      updatedAt: now,
    } satisfies PendingMessageMutation
  })
  const mutationsById = new Map(
    mutations.map((mutation) => [mutation.messageId, mutation])
  )
  const db = await openDatabase()
  const transaction = db.transaction(
    [
      "metadata",
      "messageLists",
      "messageDetails",
      "messageThreads",
      "messageMutations",
    ],
    "readwrite"
  )
  const done = transactionDone(transaction)

  for (const mutation of mutations) {
    transaction.objectStore("messageMutations").put(mutation)
  }

  for (const record of messageLists) {
    transaction.objectStore("messageLists").put({
      ...record,
      page: mutations.reduce(patchMessagePage, record.page),
      updatedAt: now,
    } satisfies CachedMessageListRecord)
  }

  const messageDetailsCursor = transaction
    .objectStore("messageDetails")
    .openCursor()
  messageDetailsCursor.onsuccess = () => {
    const cursor = messageDetailsCursor.result
    if (!cursor) return

    const record = cursor.value as CachedMessageDetailRecord
    const mutation = mutationsById.get(record.id)

    if (mutation) {
      cursor.update({
        ...record,
        message: patchMessage(record.message, mutation),
        updatedAt: now,
      } satisfies CachedMessageDetailRecord)
    }
    cursor.continue()
  }

  for (const record of messageThreads) {
    transaction.objectStore("messageThreads").put({
      ...record,
      thread: mutations.reduce(patchMessageThread, record.thread),
      updatedAt: now,
    } satisfies CachedMessageThreadRecord)
  }

  if (bootstrapRecord) {
    transaction.objectStore("metadata").put({
      ...bootstrapRecord,
      data: mutations.reduce((data, mutation) => {
        const input = inputsById.get(mutation.messageId)

        return input ? patchBootstrap(data, mutation, input.message.seen) : data
      }, bootstrapRecord.data),
      updatedAt: now,
    } satisfies CachedBootstrapRecord)
  }

  await done
  return mutations
}

export async function listPendingMessageMutations() {
  if (!isIndexedDbAvailable()) {
    return []
  }

  const mutations =
    await getAllRecords<PendingMessageMutation>("messageMutations")

  return mutations.sort((first, second) =>
    first.updatedAt.localeCompare(second.updatedAt)
  )
}

export async function removePendingMessageMutation(
  messageId: string,
  clientMutationId: string
) {
  const removedMessageIds = await removePendingMessageMutations([
    { messageId, clientMutationId },
  ])

  return removedMessageIds.includes(messageId)
}

export async function removePendingMessageMutations(
  mutations: Array<
    Pick<PendingMessageMutation, "messageId" | "clientMutationId">
  >
) {
  if (!isIndexedDbAvailable() || mutations.length === 0) {
    return []
  }

  const currentMutations =
    await getAllRecords<PendingMessageMutation>("messageMutations")
  const requestedMutations = new Map(
    mutations.map((mutation) => [mutation.messageId, mutation.clientMutationId])
  )
  const removableMessageIds = currentMutations.flatMap((mutation) =>
    requestedMutations.get(mutation.messageId) === mutation.clientMutationId
      ? [mutation.messageId]
      : []
  )

  if (removableMessageIds.length === 0) {
    return []
  }

  const db = await openDatabase()
  const transaction = db.transaction("messageMutations", "readwrite")
  const done = transactionDone(transaction)

  for (const removableMessageId of removableMessageIds) {
    transaction.objectStore("messageMutations").delete(removableMessageId)
  }
  await done
  return removableMessageIds
}

export async function synchronizeCachedMessageStates(
  states: Array<Pick<MessageListItemDto, "id" | "seen" | "flagged">>,
  settings: OfflineMailCacheSettings
) {
  if (!canUseOfflineMailCache(settings) || states.length === 0) {
    return
  }

  const [bootstrapRecord, messageLists, messageThreads, pendingMutations] =
    await Promise.all([
      getRecord<CachedBootstrapRecord>("metadata", metadataBootstrapKey),
      getAllRecords<CachedMessageListRecord>("messageLists"),
      getAllRecords<CachedMessageThreadRecord>("messageThreads"),
      getAllRecords<PendingMessageMutation>("messageMutations"),
    ])
  const statesById = new Map(
    states.map((state) => [state.id, { ...state }] as const)
  )

  for (const mutation of pendingMutations) {
    const state = statesById.get(mutation.messageId)

    if (state) {
      statesById.set(mutation.messageId, {
        ...state,
        ...mutation.flags,
      })
    }
  }

  const now = new Date().toISOString()
  const db = await openDatabase()
  const transaction = db.transaction(
    ["metadata", "messageLists", "messageDetails", "messageThreads"],
    "readwrite"
  )
  const done = transactionDone(transaction)

  if (bootstrapRecord) {
    const page = patchMessagePageStates(
      bootstrapRecord.data.initialMessages.page,
      statesById
    )

    if (page !== bootstrapRecord.data.initialMessages.page) {
      transaction.objectStore("metadata").put({
        ...bootstrapRecord,
        data: {
          ...bootstrapRecord.data,
          initialMessages: {
            ...bootstrapRecord.data.initialMessages,
            page,
          },
        },
        updatedAt: now,
      } satisfies CachedBootstrapRecord)
    }
  }

  for (const record of messageLists) {
    const page = patchMessagePageStates(record.page, statesById)

    if (page !== record.page) {
      transaction.objectStore("messageLists").put({
        ...record,
        page,
        updatedAt: now,
      } satisfies CachedMessageListRecord)
    }
  }

  const messageDetailsCursor = transaction
    .objectStore("messageDetails")
    .openCursor()
  messageDetailsCursor.onsuccess = () => {
    const cursor = messageDetailsCursor.result
    if (!cursor) return

    const record = cursor.value as CachedMessageDetailRecord
    const message = patchMessageState(record.message, statesById)

    if (message !== record.message) {
      cursor.update({
        ...record,
        message,
        updatedAt: now,
      } satisfies CachedMessageDetailRecord)
    }
    cursor.continue()
  }

  for (const record of messageThreads) {
    const thread = patchMessageThreadStates(record.thread, statesById)

    if (thread !== record.thread) {
      transaction.objectStore("messageThreads").put({
        ...record,
        thread,
        updatedAt: now,
      } satisfies CachedMessageThreadRecord)
    }
  }

  await done
}

export async function clearPendingMessageMutations() {
  if (!isIndexedDbAvailable()) {
    return
  }

  const db = await openDatabase()
  const transaction = db.transaction("messageMutations", "readwrite")
  const done = transactionDone(transaction)

  transaction.objectStore("messageMutations").clear()
  await done
}
