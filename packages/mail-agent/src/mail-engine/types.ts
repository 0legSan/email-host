import type { MailAddress, MailMessageFlags } from "../contracts"

export type MailEngineConnectionSettings = {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
}

export type MailEngineCredentials = {
  accountId?: string
  imap: MailEngineConnectionSettings
  smtp: MailEngineConnectionSettings
}

export type MailEngineErrorCode =
  "auth_error" | "connect_error" | "provider_error"

export class MailEngineError extends Error {
  readonly code: MailEngineErrorCode

  constructor(code: MailEngineErrorCode, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = "MailEngineError"
    this.code = code
  }
}

export type MailEngineMailbox = {
  path: string
  name: string
  specialUse: string | null
  messagesTotal: number | null
  messagesUnread: number | null
  uidValidity: string | null
  highestUid: number | null
  highestModseq: string | null
}

export type MailEngineMailboxStatus = {
  path: string
  messagesTotal: number | null
  messagesUnread: number | null
  uidValidity: string | null
  highestUid: number | null
  highestModseq: string | null
}

export type MailEngineMessageFlagState = {
  uid: number
  modseq: string | null
  flags: MailMessageFlags
}

export type MailEngineAttachment = {
  id: string
  part: string | null
  filename: string | null
  contentType: string | null
  contentId: string | null
  inline: boolean
  sizeBytes: number | null
}

export type MailEngineAttachmentContent = MailEngineAttachment & {
  content: Buffer
}

export type MailEngineMessageMetadata = {
  uid: number
  modseq: string | null
  emailId: string | null
  threadId: string | null
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  subject: string | null
  from: MailAddress | null
  to: MailAddress[]
  cc: MailAddress[]
  bcc: MailAddress[]
  sentAt: Date | null
  receivedAt: Date | null
  snippet: string | null
  flags: MailMessageFlags
  labels: string[]
  sizeBytes: number | null
  hasAttachments: boolean
  attachments: MailEngineAttachment[]
}

export type MailEngineParsedMessage = {
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  subject: string | null
  from: MailAddress | null
  to: MailAddress[]
  cc: MailAddress[]
  bcc: MailAddress[]
  sentAt: Date | null
  text: string | null
  html: string | null
  snippet: string | null
  attachments: MailEngineAttachmentContent[]
}

export type FetchMessageMetadataOptions = {
  fromUid?: number
  toUid?: number
  limit?: number
  seen?: boolean
  expectedCount?: number
  changedSinceModseq?: string
  includeSource?: boolean
}

export type MailEngineMessageMetadataResult = MailEngineMessageMetadata & {
  source?: Buffer
}

export type FetchMessageMetadataBatchItem = {
  key: string
  options?: FetchMessageMetadataOptions
}

export type FetchMessageMetadataBatchResult = {
  key: string
  messages: MailEngineMessageMetadataResult[]
}

export type FetchMailboxLiveStateOptions = {
  uidValidity?: string
  liveUidCursor?: number
  liveModseqCursor?: string
  initialLimit: number
  unreadExpectedCount?: number
}

export type FetchMailboxLiveStateResult = {
  status: MailEngineMailboxStatus
  batches: FetchMessageMetadataBatchResult[]
}

export type UpdateMessageFlagsRequest = {
  seen?: boolean
  flagged?: boolean
}

export type SendMailAttachment = {
  filename?: string | null
  contentType?: string | null
  contentId?: string | null
  inline?: boolean
  content: string | Buffer
}

export type SendMailPayload = {
  from: MailAddress
  to: MailAddress[]
  cc?: MailAddress[]
  bcc?: MailAddress[]
  messageId?: string | null
  subject?: string | null
  text?: string | null
  html?: string | null
  inReplyTo?: string | null
  references?: string[]
  attachments?: SendMailAttachment[]
}

export type SendMailResult = {
  messageId: string | null
  response: string | null
  accepted: string[]
  rejected: string[]
  source: Buffer
}

export type MailEngine = {
  validateImapConnection(settings: MailEngineConnectionSettings): Promise<void>
  validateSmtpConnection(settings: MailEngineConnectionSettings): Promise<void>
  validateAccountConnection(credentials: MailEngineCredentials): Promise<void>
  listMailboxes(
    credentials: MailEngineCredentials
  ): Promise<MailEngineMailbox[]>
  fetchMailboxLiveState(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    options: FetchMailboxLiveStateOptions
  ): Promise<FetchMailboxLiveStateResult>
  fetchMailboxFlagStates(
    credentials: MailEngineCredentials,
    mailboxPath: string
  ): Promise<MailEngineMessageFlagState[]>
  listMailboxUids(
    credentials: MailEngineCredentials,
    mailboxPath: string
  ): Promise<number[]>
  fetchMessageMetadata(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    options?: FetchMessageMetadataOptions
  ): Promise<MailEngineMessageMetadata[]>
  fetchMessageMetadataBatch(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    items: FetchMessageMetadataBatchItem[]
  ): Promise<FetchMessageMetadataBatchResult[]>
  fetchMessageSource(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uid: number
  ): Promise<Buffer>
  fetchMessage(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uid: number
  ): Promise<MailEngineMessageMetadata & { parsed: MailEngineParsedMessage }>
  fetchMessages(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uids: number[]
  ): Promise<
    Array<MailEngineMessageMetadata & { parsed: MailEngineParsedMessage }>
  >
  parseMessageSource(source: Buffer): Promise<MailEngineParsedMessage>
  extractAttachment(
    source: Buffer,
    attachmentId: string
  ): Promise<MailEngineAttachmentContent | null>
  updateMessageFlags(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uid: number,
    flags: UpdateMessageFlagsRequest
  ): Promise<void>
  updateMessageFlagsBatch(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uids: number[],
    flags: UpdateMessageFlagsRequest
  ): Promise<void>
  moveMessage(
    credentials: MailEngineCredentials,
    sourcePath: string,
    uid: number,
    targetPath: string
  ): Promise<number | null>
  deleteMessage(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uid: number
  ): Promise<void>
  sendMail(
    credentials: MailEngineCredentials,
    payload: SendMailPayload
  ): Promise<SendMailResult>
  appendSentMessage(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    source: Buffer,
    messageId: string | null
  ): Promise<void>
}
