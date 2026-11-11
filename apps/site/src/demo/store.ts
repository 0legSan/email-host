import { mailText } from "@workspace/mail-design/locale"
import type {
  BootstrapDto,
  MailboxDto,
  MessageDto,
  MessageListItemDto,
  MessagePageDto,
  MessagePageRequest,
} from "../../../web/src/lib/api-client"
import { createDemoData, demoUser, folderDefinitions } from "./data"

export const demoStore = createDemoData()
export function resetDemoStore() {
  Object.assign(demoStore, createDemoData())
}
export class DemoError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}
export function findMessage(id: string) {
  const message = demoStore.messages.find((item) => item.id === id)
  if (!message)
    throw new DemoError(
      "DEMO_NOT_FOUND",
      mailText("Демонстрационное письмо не найдено", "Sample email not found"),
      404
    )
  return message
}
export function listItem(message: MessageDto): MessageListItemDto {
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
export function mailboxes(accountId: string): MailboxDto[] {
  return folderDefinitions.map((folder) => {
    const messages = demoStore.messages.filter(
      (message) =>
        message.accountId === accountId && message.path === folder.path
    )
    return {
      ...folder,
      messagesTotal: messages.length,
      messagesUnread: messages.filter((message) => !message.seen).length,
      searchComplete: true,
    }
  })
}
export const initialScope: MessagePageRequest = {
  accountId: null,
  accountIds: null,
  searchMode: false,
  path: null,
  specialUse: "\\Inbox",
  customFolders: false,
  q: "",
  from: "",
  to: "",
  subject: "",
  after: "",
  before: "",
  hasAttachments: false,
  unread: false,
  flagged: false,
}
const includes = (value: string | null | undefined, query: string) =>
  (value ?? "").toLocaleLowerCase().includes(query.toLocaleLowerCase())
export function messagePage(scope: MessagePageRequest): MessagePageDto {
  const accounts =
    scope.accountIds ?? (scope.accountId ? [scope.accountId] : null)
  const messages = demoStore.messages
    .filter((message) => {
      if (accounts && !accounts.includes(message.accountId ?? "")) return false
      const folder = folderDefinitions.find(
        (item) => item.path === message.path
      )
      if (!scope.searchMode) {
        if (scope.path && message.path !== scope.path) return false
        if (
          scope.specialUse &&
          folder?.specialUse?.toLowerCase() !== scope.specialUse.toLowerCase()
        )
          return false
        if (scope.customFolders && folder?.specialUse !== null) return false
      }
      if (
        (scope.unread && message.seen) ||
        (scope.flagged && !message.flagged) ||
        (scope.hasAttachments && !message.hasAttachments)
      )
        return false
      const from = `${message.from?.name ?? ""} ${message.from?.address ?? ""}`
      const to = message.to
        .map((item) => `${item.name ?? ""} ${item.address}`)
        .join(" ")
      if (
        !includes(from, scope.from) ||
        !includes(to, scope.to) ||
        !includes(message.subject, scope.subject)
      )
        return false
      if (
        !includes(
          `${from} ${to} ${message.subject} ${message.snippet}`,
          scope.q
        )
      )
        return false
      const date = message.sentAt?.slice(0, 10) ?? ""
      return (
        (!scope.after || date >= scope.after.slice(0, 10)) &&
        (!scope.before || date <= scope.before.slice(0, 10))
      )
    })
    .sort(
      (a, b) =>
        (b.sentAt ?? "").localeCompare(a.sentAt ?? "") ||
        a.id.localeCompare(b.id)
    )
  // Bind cursors to their scope so a stale cursor cannot silently select another folder.
  const { cursor: _cursor, ...filter } = scope
  void _cursor
  const prefix = encodeURIComponent(JSON.stringify(filter))
  let offset = 0
  if (scope.cursor) {
    const separator = scope.cursor.lastIndexOf("~")
    const key = scope.cursor.slice(0, separator)
    offset = Number(scope.cursor.slice(separator + 1))
    if (key !== prefix || !Number.isInteger(offset) || offset < 0)
      throw new DemoError(
        "DEMO_INVALID_CURSOR",
        mailText(
          "Курсор не соответствует выбранному списку",
          "The cursor does not match the selected message list"
        )
      )
  }
  return {
    total: messages.length,
    messages: messages.slice(offset, offset + 50).map(listItem),
    nextPageCursor:
      offset + 50 < messages.length ? `${prefix}~${offset + 50}` : null,
  }
}
export function bootstrap(): BootstrapDto {
  return {
    user: demoUser,
    accounts: demoStore.accounts,
    profiles: demoStore.profiles,
    preferences: demoStore.preferences,
    mailboxesByAccount: Object.fromEntries(
      demoStore.accounts.map((account) => [account.id, mailboxes(account.id)])
    ),
    initialMessages: { scope: initialScope, page: messagePage(initialScope) },
  }
}
export function updateMessageFlagsBatch(
  updates: { messagePublicId: string; seen?: boolean; flagged?: boolean }[]
) {
  const messages = updates.map((update) => findMessage(update.messagePublicId))
  updates.forEach((update, index) => {
    const message = messages[index]!
    if (update.seen !== undefined) message.seen = update.seen
    if (update.flagged !== undefined) message.flagged = update.flagged
  })
  return { processed: updates.length }
}
