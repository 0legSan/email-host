import type {
  BootstrapDto,
  MailboxDto,
  MessageDto,
  MessageListItemDto,
  MessagePageDto,
  MessagePageRequest,
} from "./api-client"
import type {
  OfflineMailCacheSettings,
  PendingMessageMutation,
} from "./offline-mail-cache"
import {
  getAllRecords,
  getOfflineMailStorageRevision,
  getRecord,
} from "./offline-mail-storage"

export type OfflineMessageListRecord = {
  request: Partial<MessagePageRequest>
  page: MessagePageDto
  updatedAt: string
}

export type OfflineMessageDetailRecord = {
  message: MessageListItemDto
  source: "opened" | "recent"
  updatedAt: string
}

type Snapshot = {
  lists: OfflineMessageListRecord[]
  details: OfflineMessageDetailRecord[]
  bootstrap: BootstrapDto | null
  mutations: PendingMessageMutation[]
}

const cursorPrefix = "offline:v1:"
const localPageSize = 50
let snapshotCache: {
  revision: number
  expiresAt: number
  data: Promise<Snapshot>
} | null = null

export function isOfflineMailCursor(cursor: string | null | undefined) {
  return Boolean(cursor?.startsWith(cursorPrefix))
}

export async function readLocalMessagePage(
  request: MessagePageRequest,
  settings: OfflineMailCacheSettings
) {
  // Server cursors describe a different ordering and cannot address local rows.
  if (request.cursor && !isOfflineMailCursor(request.cursor)) return null

  const snapshot = await readSnapshot()
  if (
    !snapshot.bootstrap &&
    snapshot.lists.length === 0 &&
    snapshot.details.length === 0
  )
    return null

  return queryOfflineMessages(request, settings, snapshot)
}

async function readSnapshot(): Promise<Snapshot> {
  const revision = getOfflineMailStorageRevision()
  if (
    snapshotCache?.revision === revision &&
    snapshotCache.expiresAt > Date.now()
  ) {
    return snapshotCache.data
  }

  const data = Promise.all([
    getAllRecords<OfflineMessageListRecord>("messageLists"),
    getAllRecords<OfflineMessageDetailRecord & { message: MessageDto }>(
      "messageDetails"
    ),
    getRecord<{ data: BootstrapDto }>("metadata", "bootstrap"),
    getAllRecords<PendingMessageMutation>("messageMutations"),
  ]).then(([lists, details, bootstrap, mutations]) => ({
    lists,
    // Keep bodies out of the in-memory search snapshot.
    details: details.map((record) => ({
      ...record,
      message: toListItem(record.message),
    })),
    bootstrap: bootstrap?.data ?? null,
    mutations,
  }))
  snapshotCache = { revision, expiresAt: Date.now() + 2_000, data }
  try {
    return await data
  } catch (error) {
    if (snapshotCache?.data === data) snapshotCache = null
    throw error
  }
}

export function queryOfflineMessages(
  request: MessagePageRequest,
  settings: OfflineMailCacheSettings,
  snapshot: Snapshot
): MessagePageDto {
  const mailboxes = snapshot.bootstrap?.mailboxesByAccount ?? {}
  const entries = new Map<
    string,
    { message: MessageListItemDto; specialUse: string | null | undefined }
  >()
  const latestStates = new Map<string, MessageListItemDto>()
  const records: OfflineMessageListRecord[] = [
    ...(snapshot.bootstrap
      ? [
          {
            request: snapshot.bootstrap.initialMessages.scope,
            page: snapshot.bootstrap.initialMessages.page,
            updatedAt: "",
          },
        ]
      : []),
    ...snapshot.lists,
    ...snapshot.details
      .filter(
        (record) =>
          settings.messageMode !== "opened" || record.source === "opened"
      )
      .map((record) => ({
        request: {},
        page: { messages: [record.message], total: null, nextPageCursor: null },
        updatedAt: record.updatedAt,
      })),
  ].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))

  for (const record of records) {
    for (const message of record.page.messages) {
      latestStates.set(message.id, message)
      const mailbox = message.accountId
        ? mailboxes[message.accountId]?.find(
            (item) => item.path === message.path
          )
        : undefined
      const scope = record.request
      const specialUse =
        mailbox?.specialUse ??
        (!scope.searchMode && !scope.q && scope.specialUse
          ? scope.specialUse
          : message.path?.toUpperCase() === "INBOX"
            ? "\\Inbox"
            : undefined)
      const key = JSON.stringify([message.id, message.accountId, message.path])
      const previous = entries.get(key)
      entries.set(key, {
        message,
        specialUse: mailbox
          ? mailbox.specialUse
          : (specialUse ?? previous?.specialUse),
      })
    }
  }

  const mutations = new Map(
    snapshot.mutations.map((mutation) => [mutation.messageId, mutation])
  )
  const retainedIds = new Set(
    [...latestStates.values()]
      .sort(compareMessages)
      .filter(
        (message, index) =>
          index < settings.maxMessages ||
          message.sentAt === null ||
          Date.now() - Date.parse(message.sentAt) <=
            settings.retentionDays * 86_400_000
      )
      .map((message) => message.id)
  )
  const matches = new Map<string, MessageListItemDto>()
  for (const { message: entry, specialUse } of entries.values()) {
    if (!retainedIds.has(entry.id)) continue
    const state = latestStates.get(entry.id) ?? entry
    const message = {
      ...entry,
      seen: state.seen,
      flagged: state.flagged,
      ...mutations.get(entry.id)?.flags,
    }
    if (matchesRequest(message, specialUse, request, mailboxes))
      matches.set(message.id, message)
  }

  const messages = [...matches.values()].sort(compareMessages)
  const cursorOffset = Number(request.cursor?.slice(cursorPrefix.length) ?? 0)
  const offset =
    Number.isSafeInteger(cursorOffset) && cursorOffset >= 0 ? cursorOffset : 0
  const nextOffset = offset + localPageSize
  return {
    offline: true,
    messages: messages.slice(offset, nextOffset),
    nextPageCursor:
      nextOffset < messages.length ? `${cursorPrefix}${nextOffset}` : null,
    total: messages.length,
  }
}

function matchesRequest(
  message: MessageListItemDto,
  specialUse: string | null | undefined,
  request: MessagePageRequest,
  mailboxes: Record<string, MailboxDto[]>
) {
  if (request.accountId && message.accountId !== request.accountId) return false
  if (
    request.accountIds &&
    (!message.accountId || !request.accountIds.includes(message.accountId))
  )
    return false
  if (!request.searchMode) {
    if (request.path && message.path !== request.path) return false
    if (request.specialUse && specialUse !== request.specialUse) return false
    if (request.customFolders) {
      const known =
        message.accountId &&
        mailboxes[message.accountId]?.some(
          (mailbox) => mailbox.path === message.path
        )
      if (!known || specialUse) return false
    }
  }
  if (request.unread && message.seen) return false
  if (request.flagged && !message.flagged) return false
  if (request.hasAttachments && !message.hasAttachments) return false
  const timestamp = Date.parse(message.sentAt ?? "")
  if (request.after && !(timestamp >= Date.parse(`${request.after}T00:00:00`)))
    return false
  if (
    request.before &&
    !(timestamp < Date.parse(`${request.before}T00:00:00`) + 86_400_000)
  )
    return false

  const from = [message.from?.address, message.from?.name]
    .filter(Boolean)
    .join(" ")
  const to = message.to
    .flatMap((address) => [address.address, address.name])
    .filter(Boolean)
    .join(" ")
  const text = [message.subject, message.snippet, from, to]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
  return (
    includes(from, request.from) &&
    includes(to, request.to) &&
    includes(message.subject ?? "", request.subject) &&
    request.q
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .every((term) => text.includes(term))
  )
}

function includes(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
}

function compareMessages(a: MessageListItemDto, b: MessageListItemDto) {
  return (
    (Date.parse(b.sentAt ?? "") || 0) - (Date.parse(a.sentAt ?? "") || 0) ||
    a.id.localeCompare(b.id)
  )
}

function toListItem(message: MessageDto): MessageListItemDto {
  return {
    id: message.id,
    accountId: message.accountId,
    path: message.path,
    subject: message.subject,
    from: message.from,
    to: message.to,
    sentAt: message.sentAt,
    snippet: message.snippet,
    seen: message.seen,
    flagged: message.flagged,
    hasAttachments: message.hasAttachments,
    sizeBytes: message.sizeBytes,
    openTracking: message.openTracking,
    clickTracking: message.clickTracking,
  }
}
