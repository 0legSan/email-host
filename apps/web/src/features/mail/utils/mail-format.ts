import {
  getMailIntlLocale,
  getMailLocale,
  mailText,
} from "@workspace/mail-design/locale"
import type {
  MailAccountDto,
  MailAddress,
  MailboxDto,
  MessageThreadItemDto,
} from "@/lib/api-client"

export function getMailAccountLabel(account: MailAccountDto) {
  return account.label?.trim() || account.address
}

export function formatMailboxName(mailbox: MailboxDto) {
  const specialUseLabels: Record<string, string> = {
    "\\Inbox": mailText("Входящие", "Inbox"),
    "\\Sent": mailText("Отправленные", "Sent"),
    "\\Drafts": mailText("Черновики", "Drafts"),
    "\\Junk": mailText("Спам", "Spam"),
    "\\Trash": mailText("Удаленные", "Trash"),
  }
  return mailbox.path.toLowerCase() === "inbox"
    ? mailText("Входящие", "Inbox")
    : mailbox.specialUse
      ? (specialUseLabels[mailbox.specialUse] ?? mailbox.name)
      : mailbox.name
}

export function formatThreadMailboxLabel(message: MessageThreadItemDto) {
  const specialUseLabels: Record<string, string> = {
    "\\Inbox": mailText("Входящие", "Inbox"),
    "\\Sent": mailText("Отправленные", "Sent"),
    "\\Drafts": mailText("Черновики", "Drafts"),
    "\\Junk": mailText("Спам", "Spam"),
    "\\Trash": mailText("Удаленные", "Trash"),
  }
  return message.path?.toLowerCase() === "inbox"
    ? mailText("Входящие", "Inbox")
    : message.mailboxSpecialUse
      ? (specialUseLabels[message.mailboxSpecialUse] ??
        message.mailboxName ??
        message.path ??
        mailText("Папка", "Folder"))
      : (message.mailboxName ?? message.path ?? mailText("Папка", "Folder"))
}

export function findSpecialMailbox(
  mailboxes: MailboxDto[],
  specialUse: string
) {
  return (
    mailboxes.find((mailbox) => mailbox.specialUse === specialUse) ??
    mailboxes.find(
      (mailbox) =>
        mailbox.path.toLowerCase() === "inbox" && specialUse === "\\Inbox"
    ) ??
    null
  )
}

export function sumSpecialMailboxUnreadCount(
  accounts: MailAccountDto[],
  mailboxesByAccount: Record<string, MailboxDto[]>,
  specialUse: string | null
) {
  if (!specialUse) return 0
  return accounts.reduce((total, account) => {
    const mailbox = findSpecialMailbox(
      mailboxesByAccount[account.id] ?? [],
      specialUse
    )
    return total + (mailbox?.messagesUnread ?? 0)
  }, 0)
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat(getMailIntlLocale(), {
    notation: value > 9999 ? "compact" : "standard",
  }).format(value)
}

export function formatAddress(address: MailAddress | null | undefined) {
  if (!address) return mailText("Неизвестный отправитель", "Unknown sender")
  return address.name ? `${address.name} · ${address.address}` : address.address
}

export function formatAddressList(addresses: MailAddress[]) {
  return addresses.length === 0
    ? mailText("Нет адресатов", "No recipients")
    : addresses.map(formatAddress).join(", ")
}

export function formatDate(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  const dayMonth = new Intl.DateTimeFormat(getMailIntlLocale(), {
    day: "2-digit",
    month: "short",
  }).format(date)
  const time = new Intl.DateTimeFormat(getMailIntlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
  return date.getFullYear() === new Date().getFullYear()
    ? `${dayMonth}, ${time}`
    : `${dayMonth} ${date.getFullYear()}, ${time}`
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return ""
  return new Intl.DateTimeFormat(getMailIntlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function formatShortDateTime(value: string | null | undefined) {
  return value ? formatDate(value) : ""
}

export function formatSenderName(address: MailAddress | null | undefined) {
  if (!address) return mailText("Неизвестный отправитель", "Unknown sender")
  return (
    address.name?.trim() || address.address.split("@")[0] || address.address
  )
}

export function formatMessageCount(count: number) {
  if (getMailLocale() === "en") return count === 1 ? "message" : "messages"
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return mailText("письмо", "message")
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return mailText("письма", "messages")
  }
  return mailText("писем", "messages")
}

export function formatDraftCount(count: number) {
  if (getMailLocale() === "en") return count === 1 ? "draft" : "drafts"
  const mod10 = count % 10
  const mod100 = count % 100
  if (mod10 === 1 && mod100 !== 11) return mailText("черновик", "draft")
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return mailText("черновика", "drafts")
  }
  return mailText("черновиков", "drafts")
}

export function formatAttachmentSize(sizeBytes: number) {
  const [value, unit] =
    sizeBytes < 1024
      ? ([sizeBytes, mailText("Б", "B")] as const)
      : sizeBytes < 1024 * 1024
        ? ([sizeBytes / 1024, mailText("КБ", "KB")] as const)
        : ([sizeBytes / 1024 / 1024, mailText("МБ", "MB")] as const)
  const digits = sizeBytes < 1024 ? 0 : 1
  const number = new Intl.NumberFormat(getMailIntlLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
  return `${number} ${unit}`
}
