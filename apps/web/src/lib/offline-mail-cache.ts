import { getMailLocale } from "@workspace/mail-design/locale"
import { mailStorageKey } from "./mail-storage-namespace"
import type {
  BootstrapDto,
  MailboxDto,
  MessageDto,
  MessageListItemDto,
  MessagePageDto,
  MessagePageRequest,
  MessageThreadDto,
} from "@/lib/api-client"
import {
  getAllRecords,
  getMessageDetailMetadata,
  getRecord,
  isIndexedDbAvailable,
  openDatabase,
  putRecord,
  transactionDone,
  type CachedMessageDetailMetadata,
} from "@/lib/offline-mail-storage"
import {
  patchBootstrap,
  patchMessage,
  patchMessagePage,
  patchMessageThread,
} from "@/lib/offline-mail-mutations"
import { listPendingMessageMutations } from "@/lib/offline-mail-pending"
import { readLocalMessagePage } from "./offline-mail-query"

export {
  clearPendingMessageMutations,
  listPendingMessageMutations,
  persistPendingMessageMutation,
  persistPendingMessageMutations,
  removePendingMessageMutation,
  removePendingMessageMutations,
  synchronizeCachedMessageStates,
} from "@/lib/offline-mail-pending"

export type OfflineCacheMessageMode = "opened" | "recent-and-opened"

export type OfflineMailCacheSettings = {
  enabled: boolean
  messageMode: OfflineCacheMessageMode
  retentionDays: number
  maxMessages: number
}

export type OfflineMailCacheStatus = {
  bootstrapCachedAt: string | null
  lastUpdatedAt: string | null
  messageDetailCount: number
  messageListCount: number
  messageListItemCount: number
}

export type MessageListPosition = {
  scopeKey: string
  cursorSource: "convex" | "api"
  currentPage: number
  anchorMessageId: string | null
  anchorOffset: number
  cursors: Record<string, string | null>
  updatedAt: string
}

export type PendingMessageMutation = {
  messageId: string
  clientMutationId: string
  accountId: string | null
  path: string | null
  previousSeen: boolean
  flags: {
    seen?: boolean
    flagged?: boolean
  }
  createdAt: string
  updatedAt: string
}

export type PendingMessageMutationInput = {
  message: Pick<MessageListItemDto, "id" | "accountId" | "path" | "seen">
  clientMutationId: string
  flags: PendingMessageMutation["flags"]
}

type CachedBootstrapRecord = {
  key: "bootstrap"
  data: BootstrapDto
  cachedAt: string
  updatedAt: string
}

type CachedSettingsRecord = {
  key: "settings"
  settings: OfflineMailCacheSettings
  updatedAt: string
}

type CachedMessageListPositionRecord = MessageListPosition & {
  key: string
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
  source: OfflineMessageSource
  updatedAt: string
}

type CachedMessageThreadRecord = {
  id: string
  thread: MessageThreadDto
  cachedAt: string
  updatedAt: string
}

type OfflineMessageSource = "opened" | "recent"

type NormalizedMessagePageRequest = {
  accountId: string | null
  accountIds: string[] | null
  searchMode: boolean
  cursor: string | null
  customFolders: boolean
  from: string
  to: string
  subject: string
  after: string
  before: string
  hasAttachments: boolean
  flagged: boolean
  path: string | null
  q: string
  specialUse: string | null
  unread: boolean
}

const settingsStorageKey = mailStorageKey(
  "email-host:offline-cache-settings:v1"
)
const metadataBootstrapKey = "bootstrap"
const metadataSettingsKey = "settings"
const messageListPositionKeyPrefix = "message-list-position:"
const maxRetentionDays = 90
const minRetentionDays = 1
const maxCachedMessages = 5_000
const minCachedMessages = 50

export const defaultOfflineMailCacheSettings: OfflineMailCacheSettings = {
  enabled: true,
  messageMode: "recent-and-opened",
  retentionDays: 14,
  maxMessages: 500,
}

export function loadOfflineMailCacheSettings(): OfflineMailCacheSettings {
  let settings = defaultOfflineMailCacheSettings
  try {
    const rawSettings = window.localStorage.getItem(settingsStorageKey)

    if (rawSettings) {
      settings = normalizeOfflineMailCacheSettings(JSON.parse(rawSettings))
    }
  } catch {
    settings = defaultOfflineMailCacheSettings
  }
  void cacheOfflineMailSettings(settings).catch(() => undefined)
  return settings
}

export function saveOfflineMailCacheSettings(
  settings: OfflineMailCacheSettings
) {
  const normalizedSettings = normalizeOfflineMailCacheSettings(settings)

  try {
    window.localStorage.setItem(
      settingsStorageKey,
      JSON.stringify(normalizedSettings)
    )
  } catch {
    void cacheOfflineMailSettings(normalizedSettings).catch(() => undefined)
    return normalizedSettings
  }

  void cacheOfflineMailSettings(normalizedSettings).catch(() => undefined)
  return normalizedSettings
}

async function cacheOfflineMailSettings(settings: OfflineMailCacheSettings) {
  if (!isIndexedDbAvailable()) return
  await putRecord("metadata", {
    key: metadataSettingsKey,
    settings,
    updatedAt: new Date().toISOString(),
  } satisfies CachedSettingsRecord)
}

export function normalizeOfflineMailCacheSettings(
  value: unknown
): OfflineMailCacheSettings {
  if (!value || typeof value !== "object") {
    return defaultOfflineMailCacheSettings
  }

  const candidate = value as Partial<OfflineMailCacheSettings>
  const messageMode =
    candidate.messageMode === "opened" ||
    candidate.messageMode === "recent-and-opened"
      ? candidate.messageMode
      : defaultOfflineMailCacheSettings.messageMode
  const retentionDays =
    typeof candidate.retentionDays === "number"
      ? clamp(
          Math.round(candidate.retentionDays),
          minRetentionDays,
          maxRetentionDays
        )
      : defaultOfflineMailCacheSettings.retentionDays
  const maxMessages =
    typeof candidate.maxMessages === "number"
      ? clamp(
          Math.round(candidate.maxMessages),
          minCachedMessages,
          maxCachedMessages
        )
      : defaultOfflineMailCacheSettings.maxMessages

  return {
    enabled:
      typeof candidate.enabled === "boolean"
        ? candidate.enabled
        : defaultOfflineMailCacheSettings.enabled,
    messageMode,
    retentionDays,
    maxMessages,
  }
}

export async function cacheBootstrap(
  data: BootstrapDto,
  settings: OfflineMailCacheSettings
) {
  if (!canUseOfflineMailCache(settings)) {
    return
  }

  const db = await openDatabase()
  const now = new Date().toISOString()
  const transaction = db.transaction(["metadata", "messageLists"], "readwrite")
  const done = transactionDone(transaction)
  const bootstrapStore = transaction.objectStore("metadata")
  const messageListStore = transaction.objectStore("messageLists")

  bootstrapStore.put({
    key: metadataBootstrapKey,
    data,
    cachedAt: now,
    updatedAt: now,
  } satisfies CachedBootstrapRecord)
  messageListStore.put({
    key: createMessagePageCacheKey(data.initialMessages.scope),
    request: normalizeMessagePageRequest(data.initialMessages.scope),
    page: filterMessagePageForRetention(data.initialMessages.page, settings),
    cachedAt: now,
    updatedAt: now,
  } satisfies CachedMessageListRecord)

  await done
}

export async function updateCachedBootstrap(
  patch: Partial<
    Pick<
      BootstrapDto,
      "accounts" | "mailboxesByAccount" | "preferences" | "profiles"
    >
  >,
  settings: OfflineMailCacheSettings
) {
  if (!canUseOfflineMailCache(settings)) {
    return
  }

  const currentRecord = await getRecord<CachedBootstrapRecord>(
    "metadata",
    metadataBootstrapKey
  )

  if (!currentRecord) {
    return
  }

  const now = new Date().toISOString()

  await putRecord("metadata", {
    ...currentRecord,
    data: {
      ...currentRecord.data,
      ...patch,
    },
    updatedAt: now,
  } satisfies CachedBootstrapRecord)
}

export async function readCachedBootstrap(settings: OfflineMailCacheSettings) {
  if (!canUseOfflineMailCache(settings)) {
    return null
  }

  const record = await getRecord<CachedBootstrapRecord>(
    "metadata",
    metadataBootstrapKey
  )

  if (!record) {
    return null
  }

  const localPage = await readLocalMessagePage(
    record.data.initialMessages.scope,
    settings
  )
  return {
    ...record.data,
    initialMessages: {
      ...record.data.initialMessages,
      page:
        localPage ??
        filterMessagePageForRetention(
          record.data.initialMessages.page,
          settings
        ),
    },
  } satisfies BootstrapDto
}

export async function cacheMessageListPosition(
  position: Omit<MessageListPosition, "updatedAt">
) {
  if (!isIndexedDbAvailable()) {
    return
  }

  await putRecord("metadata", {
    ...position,
    key: `${messageListPositionKeyPrefix}${position.scopeKey}`,
    updatedAt: new Date().toISOString(),
  } satisfies CachedMessageListPositionRecord)
}

export async function readCachedMessageListPosition(scopeKey: string) {
  if (!isIndexedDbAvailable()) {
    return null
  }

  const record = await getRecord<CachedMessageListPositionRecord>(
    "metadata",
    `${messageListPositionKeyPrefix}${scopeKey}`
  )

  return record
    ? ({
        scopeKey: record.scopeKey,
        cursorSource: record.cursorSource,
        currentPage: record.currentPage,
        anchorMessageId: record.anchorMessageId,
        anchorOffset: record.anchorOffset,
        cursors: record.cursors,
        updatedAt: record.updatedAt,
      } satisfies MessageListPosition)
    : null
}

export async function cacheMessageList(
  request: MessagePageRequest,
  page: MessagePageDto,
  settings: OfflineMailCacheSettings
) {
  if (!canUseOfflineMailCache(settings)) {
    return
  }

  const now = new Date().toISOString()

  await putRecord("messageLists", {
    key: createMessagePageCacheKey(request),
    request: normalizeMessagePageRequest(request),
    page: filterMessagePageForRetention(page, settings),
    cachedAt: now,
    updatedAt: now,
  } satisfies CachedMessageListRecord)
}

export async function readCachedMessageList(
  request: MessagePageRequest,
  settings: OfflineMailCacheSettings
) {
  if (!canUseOfflineMailCache(settings)) {
    return null
  }

  return readLocalMessagePage(request, settings)
}

export async function cacheOpenedMessage(
  message: MessageDto,
  settings: OfflineMailCacheSettings
) {
  await cacheMessageDetail(message, settings, "opened")
}

export async function cacheRecentMessage(
  message: MessageDto,
  settings: OfflineMailCacheSettings
) {
  if (settings.messageMode !== "recent-and-opened") {
    return
  }

  await cacheMessageDetail(message, settings, "recent")
}

export async function readCachedMessageDetail(
  messageId: string,
  settings: OfflineMailCacheSettings
) {
  if (!canUseOfflineMailCache(settings)) {
    return null
  }

  const record = await getRecord<CachedMessageDetailRecord>(
    "messageDetails",
    messageId
  )

  if (!record) {
    return null
  }

  return isUsableMessageDetailRecord(record, settings) &&
    record.message.bodyStatus === "loaded"
    ? record.message
    : null
}

export async function cacheMessageThread(
  messageId: string,
  thread: MessageThreadDto,
  settings: OfflineMailCacheSettings
) {
  if (!canUseOfflineMailCache(settings)) {
    return
  }

  const currentRecord = await getRecord<CachedMessageThreadRecord>(
    "messageThreads",
    messageId
  )
  const now = new Date().toISOString()

  await putRecord("messageThreads", {
    id: messageId,
    thread,
    cachedAt: currentRecord?.cachedAt ?? now,
    updatedAt: now,
  } satisfies CachedMessageThreadRecord)
}

export async function readCachedMessageThread(
  messageId: string,
  settings: OfflineMailCacheSettings
) {
  if (!canUseOfflineMailCache(settings)) {
    return null
  }

  const record = await getRecord<CachedMessageThreadRecord>(
    "messageThreads",
    messageId
  )

  return record?.thread ?? null
}

export async function hasCachedMessageDetail(
  messageId: string,
  settings: OfflineMailCacheSettings
) {
  return Boolean(await readCachedMessageDetail(messageId, settings))
}

export async function applyPendingMessageMutationsToBootstrap(
  data: BootstrapDto
) {
  const mutations = await listPendingMessageMutations()

  return mutations.reduce((current, mutation) => {
    const serverMessage = current.initialMessages.page.messages.find(
      (message) => message.id === mutation.messageId
    )

    return patchBootstrap(current, mutation, serverMessage?.seen)
  }, data)
}

export async function applyPendingMessageMutationsToMailboxes(
  accountId: string,
  mailboxes: MailboxDto[]
) {
  const mutations = await listPendingMessageMutations()

  return mutations.reduce((currentMailboxes, mutation) => {
    if (mutation.accountId !== accountId || !mutation.path) {
      return currentMailboxes
    }

    const nextSeen = mutation.flags.seen

    if (typeof nextSeen !== "boolean" || nextSeen === mutation.previousSeen) {
      return currentMailboxes
    }

    const unreadDelta = nextSeen ? -1 : 1

    return currentMailboxes.map((mailbox) =>
      mailbox.path === mutation.path
        ? {
            ...mailbox,
            messagesUnread:
              mailbox.messagesUnread === null
                ? null
                : Math.max(0, mailbox.messagesUnread + unreadDelta),
          }
        : mailbox
    )
  }, mailboxes)
}

export async function applyPendingMessageMutationsToPage(page: MessagePageDto) {
  const mutations = await listPendingMessageMutations()

  return mutations.reduce(patchMessagePage, page)
}

export async function applyPendingMessageMutationsToMessage(
  message: MessageDto
) {
  const mutation = await getRecord<PendingMessageMutation>(
    "messageMutations",
    message.id
  )

  return mutation ? patchMessage(message, mutation) : message
}

export async function applyPendingMessageMutationsToThread(
  thread: MessageThreadDto
) {
  const mutations = await listPendingMessageMutations()

  return mutations.reduce(patchMessageThread, thread)
}

export async function pruneOfflineMailCache(
  settings: OfflineMailCacheSettings
) {
  if (!isIndexedDbAvailable()) {
    return
  }

  const messageDetails = await getMessageDetailMetadata()
  const messageLists =
    await getAllRecords<CachedMessageListRecord>("messageLists")
  const messageThreads =
    await getAllRecords<CachedMessageThreadRecord>("messageThreads")
  const usableMessageDetailIds = getUsableMessageDetailIds(
    messageDetails,
    settings
  )
  const usableMessageListItemIds = getUsableMessageListItemIds(
    messageLists,
    settings
  )
  const db = await openDatabase()
  const transaction = db.transaction(
    ["messageDetails", "messageLists", "messageThreads"],
    "readwrite"
  )
  const done = transactionDone(transaction)
  const messageDetailsStore = transaction.objectStore("messageDetails")
  const messageListsStore = transaction.objectStore("messageLists")
  const messageThreadsStore = transaction.objectStore("messageThreads")

  for (const record of messageDetails) {
    if (!usableMessageDetailIds.has(record.id)) {
      messageDetailsStore.delete(record.id)
    }
  }

  for (const record of messageLists) {
    const page = filterMessagePageForRetention(
      record.page,
      settings,
      usableMessageListItemIds
    )

    if (page.messages.length !== record.page.messages.length) {
      messageListsStore.put({
        ...record,
        page,
      } satisfies CachedMessageListRecord)
    }
  }

  for (const record of messageThreads) {
    if (!usableMessageDetailIds.has(record.id)) {
      messageThreadsStore.delete(record.id)
    }
  }

  await done
}

export async function getOfflineMailCacheStatus(
  settings: OfflineMailCacheSettings
): Promise<OfflineMailCacheStatus> {
  if (!isIndexedDbAvailable()) {
    return {
      bootstrapCachedAt: null,
      lastUpdatedAt: null,
      messageDetailCount: 0,
      messageListCount: 0,
      messageListItemCount: 0,
    }
  }

  const bootstrapRecord = await getRecord<CachedBootstrapRecord>(
    "metadata",
    metadataBootstrapKey
  )
  const messageDetails = await getMessageDetailMetadata()
  const messageLists =
    await getAllRecords<CachedMessageListRecord>("messageLists")

  const usableMessageDetailIds = getUsableMessageDetailIds(
    messageDetails,
    settings
  )
  const usableDetails = messageDetails.filter((record) =>
    usableMessageDetailIds.has(record.id)
  )
  const usableMessageListItemIds = getUsableMessageListItemIds(
    messageLists,
    settings
  )
  const usableLists = messageLists
  const messageListItemIds = new Set<string>()

  for (const record of usableLists) {
    for (const message of filterMessagePageForRetention(
      record.page,
      settings,
      usableMessageListItemIds
    ).messages) {
      messageListItemIds.add(message.id)
    }
  }

  return {
    bootstrapCachedAt: bootstrapRecord?.cachedAt ?? null,
    lastUpdatedAt: getLastUpdatedAt([
      bootstrapRecord?.updatedAt,
      ...usableDetails.map((record) => record.updatedAt),
      ...usableLists.map((record) => record.updatedAt),
    ]),
    messageDetailCount: usableDetails.length,
    messageListCount: usableLists.length,
    messageListItemCount: messageListItemIds.size,
  }
}

export async function clearOfflineMailCache() {
  if (!isIndexedDbAvailable()) {
    return
  }

  const db = await openDatabase()
  const transaction = db.transaction(
    ["metadata", "messageDetails", "messageLists", "messageThreads"],
    "readwrite"
  )
  const done = transactionDone(transaction)

  transaction.objectStore("metadata").clear()
  transaction
    .objectStore("metadata")
    .put({ key: "language", locale: getMailLocale() })
  transaction.objectStore("messageDetails").clear()
  transaction.objectStore("messageLists").clear()
  transaction.objectStore("messageThreads").clear()
  await done
}

function canUseOfflineMailCache(settings: OfflineMailCacheSettings) {
  return settings.enabled && isIndexedDbAvailable()
}

async function cacheMessageDetail(
  message: MessageDto,
  settings: OfflineMailCacheSettings,
  source: OfflineMessageSource
) {
  if (!canUseOfflineMailCache(settings)) {
    return
  }

  // A metadata-only refresh must never replace an already downloaded body.
  if (message.bodyStatus !== "loaded") return
  const currentRecord = await getRecord<CachedMessageDetailRecord>(
    "messageDetails",
    message.id
  )
  const now = new Date().toISOString()
  const nextSource =
    currentRecord?.source === "opened" || source === "opened"
      ? "opened"
      : "recent"

  await putRecord("messageDetails", {
    id: message.id,
    message,
    cachedAt: currentRecord?.cachedAt ?? now,
    openedAt: source === "opened" ? now : (currentRecord?.openedAt ?? null),
    sentAt: message.sentAt,
    source: nextSource,
    updatedAt: now,
  } satisfies CachedMessageDetailRecord)
}

function isUsableMessageDetailRecord(
  record: CachedMessageDetailMetadata,
  settings: OfflineMailCacheSettings
) {
  if (settings.messageMode === "opened" && record.source !== "opened") {
    return false
  }

  return true
}

function filterMessagePageForRetention(
  page: MessagePageDto,
  settings: OfflineMailCacheSettings,
  usableMessageIds?: Set<string>
) {
  const retainedMessageIds =
    usableMessageIds ?? getRetainedMessageIds(page.messages, settings)

  return {
    ...page,
    messages: page.messages.filter((message) =>
      retainedMessageIds.has(message.id)
    ),
  } satisfies MessagePageDto
}

function getUsableMessageListItemIds(
  records: CachedMessageListRecord[],
  settings: OfflineMailCacheSettings
) {
  const messagesById = new Map<string, MessageListItemDto>()

  for (const record of records) {
    for (const message of record.page.messages) {
      if (!messagesById.has(message.id)) {
        messagesById.set(message.id, message)
      }
    }
  }

  return getRetainedMessageIds([...messagesById.values()], settings)
}

function getUsableMessageDetailIds(
  records: CachedMessageDetailMetadata[],
  settings: OfflineMailCacheSettings
) {
  const usableRecords = records.filter((record) =>
    isUsableMessageDetailRecord(record, settings)
  )

  const retainedIds = new Set(
    usableRecords
      .filter((record) => isRecordInsideRetentionPeriod(record, settings))
      .map((record) => record.id)
  )

  for (const record of usableRecords
    .sort(
      (first, second) => getRecordSortTime(second) - getRecordSortTime(first)
    )
    .slice(0, settings.maxMessages)) {
    retainedIds.add(record.id)
  }

  return retainedIds
}

function createMessagePageCacheKey(request: MessagePageRequest) {
  return JSON.stringify(normalizeMessagePageRequest(request))
}

function normalizeMessagePageRequest(
  request: MessagePageRequest
): NormalizedMessagePageRequest {
  return {
    accountId: request.accountId,
    accountIds: request.accountIds ? [...request.accountIds].sort() : null,
    searchMode: request.searchMode,
    cursor: request.cursor ?? null,
    customFolders: request.customFolders,
    from: request.from,
    to: request.to,
    subject: request.subject,
    after: request.after,
    before: request.before,
    hasAttachments: request.hasAttachments,
    flagged: request.flagged,
    path: request.path,
    q: request.q,
    specialUse: request.specialUse,
    unread: request.unread,
  }
}

function getRetainedMessageIds(
  messages: MessageListItemDto[],
  settings: OfflineMailCacheSettings
) {
  const retainedIds = new Set(
    messages
      .filter((message) => isMessageInsideRetentionPeriod(message, settings))
      .map((message) => message.id)
  )

  for (const message of [...messages]
    .sort(
      (first, second) => getMessageSortTime(second) - getMessageSortTime(first)
    )
    .slice(0, settings.maxMessages)) {
    retainedIds.add(message.id)
  }

  return retainedIds
}

function isMessageInsideRetentionPeriod(
  message: MessageListItemDto,
  settings: OfflineMailCacheSettings
) {
  const timestamp = parseTimestamp(message.sentAt)

  return timestamp === null || isTimestampInsideRetention(timestamp, settings)
}

function isRecordInsideRetentionPeriod(
  record: CachedMessageDetailMetadata,
  settings: OfflineMailCacheSettings
) {
  const timestamp =
    parseTimestamp(record.sentAt) ?? parseTimestamp(record.cachedAt)

  return timestamp === null || isTimestampInsideRetention(timestamp, settings)
}

function isTimestampInsideRetention(
  timestamp: number,
  settings: OfflineMailCacheSettings
) {
  return Date.now() - timestamp <= settings.retentionDays * 24 * 60 * 60 * 1000
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const timestamp = Date.parse(value)

  return Number.isFinite(timestamp) ? timestamp : null
}

function getLastUpdatedAt(values: Array<string | null | undefined>) {
  let lastTimestamp: number | null = null

  for (const value of values) {
    const timestamp = parseTimestamp(value)

    if (
      timestamp !== null &&
      (lastTimestamp === null || timestamp > lastTimestamp)
    ) {
      lastTimestamp = timestamp
    }
  }

  return lastTimestamp === null ? null : new Date(lastTimestamp).toISOString()
}

function getRecordSortTime(record: CachedMessageDetailMetadata) {
  return parseTimestamp(record.sentAt) ?? parseTimestamp(record.cachedAt) ?? 0
}

function getMessageSortTime(message: MessageListItemDto) {
  return parseTimestamp(message.sentAt) ?? 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
