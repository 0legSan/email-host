export type MailAddressView = {
  address: string
  name?: string | null
}

export type MailAccountView = {
  id: string
  address: string
  displayName: string
  enabled: boolean
}

export type MailProfileView = {
  id: string
  name: string
  accountIds: readonly string[]
}

export type MailFolderView = {
  accountId: string
  path: string
  name: string
  specialUse?: string | null
  unreadCount?: number
}

export type MailMessageView = {
  id: string
  accountId: string
  subject?: string | null
  snippet?: string | null
  from?: MailAddressView | null
  to?: readonly MailAddressView[]
  sentAt?: string | null
  seen: boolean
  flagged: boolean
  hasAttachments?: boolean
  isDraft?: boolean
}

export type MailAttachmentView = {
  id: string
  filename?: string | null
  contentType?: string | null
  sizeBytes?: number | null
}

export type MailThreadMessageView = MailMessageView & {
  mailboxName?: string | null
  mailboxSpecialUse?: string | null
}

export type MailConversationView = {
  id: string
  messages: readonly MailThreadMessageView[]
}
