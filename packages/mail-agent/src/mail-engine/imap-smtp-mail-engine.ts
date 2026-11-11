import { createHash } from "crypto"

import {
  ImapFlow,
  type FetchMessageObject,
  type ImapFlowOptions,
  type ListResponse,
  type MailboxLockObject,
  type MessageAddressObject,
  type MessageStructureObject,
  type StatusObject,
} from "imapflow"
import { simpleParser, type AddressObject, type Attachment } from "mailparser"
import * as nodemailer from "nodemailer"
import type SMTPTransport from "nodemailer/lib/smtp-transport"

import type { MailAddress, MailMessageFlags } from "../contracts"
import { createMailSnippet } from "../mail-content"
import { normalizeMailEngineError } from "./errors"
import type {
  FetchMessageMetadataBatchItem,
  FetchMessageMetadataBatchResult,
  FetchMessageMetadataOptions,
  FetchMailboxLiveStateOptions,
  FetchMailboxLiveStateResult,
  MailEngine,
  MailEngineAttachment,
  MailEngineAttachmentContent,
  MailEngineConnectionSettings,
  MailEngineCredentials,
  MailEngineErrorCode,
  MailEngineMailbox,
  MailEngineMailboxStatus,
  MailEngineMessageFlagState,
  MailEngineMessageMetadata,
  MailEngineMessageMetadataResult,
  MailEngineParsedMessage,
  SendMailPayload,
  SendMailResult,
  UpdateMessageFlagsRequest,
} from "./types"
import { MailEngineError } from "./types"

export class ImapSmtpMailEngine implements MailEngine {
  private readonly imapClientExecutor: ImapClientExecutor | null
  private readonly connectionStartScheduler: ImapConnectionStartScheduler | null
  private readonly temporaryImapLimiter = new TemporaryImapLimiter()

  constructor(
    imapClientExecutor: ImapClientExecutor | null = null,
    connectionStartScheduler: ImapConnectionStartScheduler | null = null
  ) {
    this.imapClientExecutor = imapClientExecutor
    this.connectionStartScheduler = connectionStartScheduler
  }

  async validateImapConnection(settings: MailEngineConnectionSettings) {
    try {
      await this.withTemporaryImap(settings, async () => undefined)
    } catch (error) {
      throw addConnectionContext(error, "IMAP")
    }
  }

  async validateSmtpConnection(settings: MailEngineConnectionSettings) {
    const transporter = createSmtpTransport(settings)

    try {
      await transporter.verify()
    } catch (error) {
      throw addConnectionContext(error, "SMTP")
    } finally {
      transporter.close()
    }
  }

  async validateAccountConnection(credentials: MailEngineCredentials) {
    await this.validateImapConnection(credentials.imap)
    await this.validateSmtpConnection(credentials.smtp)
  }

  async listMailboxes(credentials: MailEngineCredentials) {
    return this.withImap(credentials, async (client) => {
      const mailboxes = await client.list({
        statusQuery: {
          highestModseq: true,
          messages: true,
          uidNext: true,
          uidValidity: true,
          unseen: true,
        },
      })

      return mailboxes.filter(isSelectableMailbox).map(toMailbox)
    })
  }

  async fetchMailboxLiveState(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    options: FetchMailboxLiveStateOptions
  ): Promise<FetchMailboxLiveStateResult> {
    return this.withImap(credentials, async (client) => {
      const status = toMailboxStatus(
        await client.status(mailboxPath, {
          highestModseq: true,
          messages: true,
          uidNext: true,
          uidValidity: true,
          unseen: true,
        })
      )
      const uidValidityChanged =
        status.uidValidity !== null &&
        options.uidValidity !== undefined &&
        status.uidValidity !== options.uidValidity
      const liveUidCursor = uidValidityChanged
        ? undefined
        : options.liveUidCursor
      const liveModseqCursor = uidValidityChanged
        ? undefined
        : options.liveModseqCursor
      const initialSync = liveUidCursor === undefined
      const hasNewMessages =
        liveUidCursor !== undefined &&
        status.highestUid !== null &&
        status.highestUid > liveUidCursor
      const hasModseqChanges =
        liveUidCursor !== undefined &&
        liveModseqCursor !== undefined &&
        status.highestModseq !== null &&
        status.highestModseq !== liveModseqCursor
      const items: FetchMessageMetadataBatchItem[] = [
        ...(initialSync
          ? [
              {
                key: "recent",
                options: { limit: options.initialLimit },
              },
              {
                key: "unread",
                options: {
                  seen: false,
                  expectedCount: options.unreadExpectedCount,
                },
              },
            ]
          : []),
        ...(hasNewMessages
          ? [
              {
                key: "new",
                options: {
                  fromUid: liveUidCursor + 1,
                  toUid: status.highestUid!,
                },
              },
            ]
          : []),
        ...(hasModseqChanges
          ? [
              {
                key: "changed",
                options: {
                  changedSinceModseq: liveModseqCursor,
                },
              },
            ]
          : []),
      ]
      const batches =
        items.length > 0
          ? await this.withMailboxLock(client, mailboxPath, true, async () => {
              const result: FetchMessageMetadataBatchResult[] = []
              for (const item of items) {
                result.push({
                  key: item.key,
                  messages: await fetchMessageMetadata(
                    client,
                    item.options ?? {}
                  ),
                })
              }
              return result
            })
          : []
      return { status, batches }
    })
  }

  async fetchMailboxFlagStates(
    credentials: MailEngineCredentials,
    mailboxPath: string
  ): Promise<MailEngineMessageFlagState[]> {
    return this.withImap(credentials, async (client) =>
      this.withMailboxLock(client, mailboxPath, true, async () => {
        const states: MailEngineMessageFlagState[] = []
        for await (const message of client.fetch(
          "1:*",
          { flags: true, uid: true },
          { uid: true }
        )) {
          states.push({
            uid: message.uid,
            modseq: message.modseq?.toString() ?? null,
            flags: toMessageFlags(message.flags),
          })
        }
        return states
      })
    )
  }

  async listMailboxUids(
    credentials: MailEngineCredentials,
    mailboxPath: string
  ): Promise<number[]> {
    return this.withImap(credentials, async (client) =>
      this.withMailboxLock(client, mailboxPath, true, async () => {
        const uids = await client.search({ all: true }, { uid: true })
        return uids ? uids.sort((first, second) => first - second) : []
      })
    )
  }

  async fetchMessageMetadata(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    options: FetchMessageMetadataOptions = {}
  ) {
    return this.withImap(credentials, async (client) =>
      this.withMailboxLock(client, mailboxPath, true, async () => {
        return fetchMessageMetadata(client, options)
      })
    )
  }

  async fetchMessageMetadataBatch(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    items: FetchMessageMetadataBatchItem[]
  ): Promise<FetchMessageMetadataBatchResult[]> {
    return this.withImap(credentials, async (client) =>
      this.withMailboxLock(client, mailboxPath, true, async () => {
        const results: FetchMessageMetadataBatchResult[] = []

        for (const item of items) {
          results.push({
            key: item.key,
            messages: await fetchMessageMetadata(client, item.options ?? {}),
          })
        }

        return results
      })
    )
  }

  async fetchMessageSource(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uid: number
  ) {
    return this.withImap(credentials, async (client) =>
      this.withMailboxLock(client, mailboxPath, true, async () => {
        const message = await client.fetchOne(
          uid,
          {
            source: true,
            uid: true,
          },
          { uid: true }
        )

        if (!message || !message.source) {
          throw normalizeMailEngineError(new Error("Message source not found"))
        }

        return message.source
      })
    )
  }

  async fetchMessage(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uid: number
  ) {
    const [message] = await this.fetchMessages(
      credentials,
      mailboxPath,
      [uid],
      "high"
    )

    if (!message) {
      throw normalizeMailEngineError(new Error("Message not found"))
    }

    return message
  }

  async fetchMessages(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uids: number[],
    priority: ImapOperationPriority = "normal"
  ) {
    const uniqueUids = [...new Set(uids)]
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((first, second) => first - second)

    if (uniqueUids.length === 0) {
      return []
    }

    return this.withImap(
      credentials,
      async (client) =>
        this.withMailboxLock(client, mailboxPath, true, async () => {
          const messages: Array<
            MailEngineMessageMetadata & { parsed: MailEngineParsedMessage }
          > = []

          for await (const message of client.fetch(
            uniqueUids,
            {
              bodyStructure: true,
              envelope: true,
              flags: true,
              headers: ["in-reply-to", "references"],
              internalDate: true,
              labels: true,
              size: true,
              source: true,
              threadId: true,
              uid: true,
            },
            { uid: true }
          )) {
            if (!message.source) {
              continue
            }

            messages.push({
              ...(await toMessageMetadata(message)),
              parsed: await this.parseMessageSource(message.source),
            })
          }

          return messages.sort((first, second) => first.uid - second.uid)
        }),
      priority
    )
  }

  async parseMessageSource(source: Buffer) {
    const parsed = await simpleParser(source, {
      keepCidLinks: true,
      skipHtmlToText: true,
      skipTextToHtml: true,
    })
    const text = normalizeString(parsed.text)
    const html =
      typeof parsed.html === "string" ? normalizeString(parsed.html) : null
    const attachments = parsed.attachments.map(toParsedAttachment)

    return {
      messageId: normalizeString(parsed.messageId),
      inReplyTo: normalizeString(parsed.inReplyTo),
      references: normalizeReferences(parsed.references),
      subject: normalizeString(parsed.subject),
      from: toParsedAddress(firstAddressObject(parsed.from)),
      to: toParsedAddresses(parsed.to),
      cc: toParsedAddresses(parsed.cc),
      bcc: toParsedAddresses(parsed.bcc),
      sentAt: parsed.date ?? null,
      text,
      html,
      snippet: createMailSnippet(text, html),
      attachments,
    }
  }

  async extractAttachment(source: Buffer, attachmentId: string) {
    const parsed = await this.parseMessageSource(source)

    return (
      parsed.attachments.find((attachment) => attachment.id === attachmentId) ??
      null
    )
  }

  async updateMessageFlags(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uid: number,
    flags: UpdateMessageFlagsRequest
  ) {
    await this.updateMessageFlagsBatch(credentials, mailboxPath, [uid], flags)
  }

  async updateMessageFlagsBatch(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uids: number[],
    flags: UpdateMessageFlagsRequest
  ) {
    if (uids.length === 0) return

    await this.withImap(credentials, async (client) =>
      this.withMailboxLock(client, mailboxPath, false, async () => {
        const addFlags: string[] = []
        const removeFlags: string[] = []

        collectFlagMutation(flags.seen, "\\Seen", addFlags, removeFlags)
        collectFlagMutation(flags.flagged, "\\Flagged", addFlags, removeFlags)

        if (addFlags.length > 0) {
          await client.messageFlagsAdd(uids, addFlags, { uid: true })
        }

        if (removeFlags.length > 0) {
          await client.messageFlagsRemove(uids, removeFlags, { uid: true })
        }
      })
    )
  }

  async moveMessage(
    credentials: MailEngineCredentials,
    sourcePath: string,
    uid: number,
    targetPath: string
  ) {
    return this.withImap(credentials, async (client) =>
      this.withMailboxLock(client, sourcePath, false, async () => {
        const response = await client.messageMove(uid, targetPath, {
          uid: true,
        })

        if (!response) {
          return null
        }

        return response.uidMap?.get(uid) ?? null
      })
    )
  }

  async deleteMessage(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    uid: number
  ) {
    await this.withImap(credentials, async (client) =>
      this.withMailboxLock(client, mailboxPath, false, async () => {
        await client.messageDelete(uid, { uid: true })
      })
    )
  }

  async sendMail(
    credentials: MailEngineCredentials,
    payload: SendMailPayload
  ): Promise<SendMailResult> {
    const transporter = createSmtpTransport(credentials.smtp)

    try {
      const compiled = await compileMail(payload)
      const result = await transporter.sendMail({
        envelope: compiled.envelope,
        raw: compiled.source,
      })

      return {
        accepted: result.accepted.map(String),
        messageId:
          normalizeString(result.messageId) ??
          normalizeString(compiled.messageId),
        rejected: result.rejected.map(String),
        response: normalizeString(result.response),
        source: compiled.source,
      }
    } catch (error) {
      throw normalizeMailEngineError(error)
    } finally {
      transporter.close()
    }
  }

  async appendSentMessage(
    credentials: MailEngineCredentials,
    mailboxPath: string,
    source: Buffer,
    messageId: string | null
  ) {
    await this.withImap(
      credentials,
      async (client) =>
        this.withMailboxLock(client, mailboxPath, false, async () => {
          if (messageId) {
            const matches = await client.search(
              { header: { "Message-ID": messageId } },
              { uid: true }
            )

            if (Array.isArray(matches) && matches.length > 0) {
              return
            }
          }

          const result = await client.append(
            mailboxPath,
            source,
            ["\\Seen"],
            new Date()
          )

          if (!result) {
            throw new MailEngineError(
              "provider_error",
              "Mail provider did not save the sent message"
            )
          }
        }),
      "high"
    )
  }

  private async withImap<T>(
    credentials: MailEngineCredentials,
    callback: (client: ImapFlow) => Promise<T>,
    priority: ImapOperationPriority = "normal"
  ) {
    if (
      this.imapClientExecutor &&
      credentials.accountId !== undefined &&
      this.imapClientExecutor.supports(credentials.imap, credentials.accountId)
    ) {
      try {
        return await this.imapClientExecutor.run(
          credentials.accountId,
          callback
        )
      } catch (error) {
        throw normalizeMailEngineError(error)
      }
    }

    return this.withTemporaryImap(credentials.imap, callback, priority)
  }

  private async withTemporaryImap<T>(
    settings: MailEngineConnectionSettings,
    callback: (client: ImapFlow) => Promise<T>,
    priority: ImapOperationPriority = "normal"
  ) {
    return this.temporaryImapLimiter.run(
      settings.host,
      async () => {
        const connectionStartDelayMs =
          this.connectionStartScheduler?.reserveDelay(settings.host) ?? 0

        if (connectionStartDelayMs > 0) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, connectionStartDelayMs)
          )
        }

        const client = createImapClient(settings)
        client.on("error", () => undefined)
        const connectionStartedAt = Date.now()
        let connected = false

        try {
          await client.connect()
          connected = true
          this.connectionStartScheduler?.recordConnectionSuccess(
            settings.host,
            Date.now() - connectionStartedAt
          )
          return await callback(client)
        } catch (error) {
          if (!connected) {
            this.connectionStartScheduler?.recordConnectionFailure(
              settings.host,
              Date.now() - connectionStartedAt,
              error
            )
          }
          throw normalizeMailEngineError(error)
        } finally {
          await closeImapClient(client)
        }
      },
      priority
    )
  }

  private async withMailboxLock<T>(
    client: ImapFlow,
    mailboxPath: string,
    readOnly: boolean,
    callback: () => Promise<T>
  ) {
    let lock: MailboxLockObject | null = null

    try {
      lock = await client.getMailboxLock(mailboxPath, {
        acquireTimeout: 15_000,
        readOnly,
      })

      return await callback()
    } finally {
      lock?.release()
    }
  }
}

export type ImapClientExecutor = {
  supports(settings: MailEngineConnectionSettings, accountId?: string): boolean
  run<T>(
    accountId: string,
    operation: (client: ImapFlow) => Promise<T>
  ): Promise<T>
}

type ImapConnectionStartScheduler = {
  reserveDelay(host: string): number
  recordConnectionSuccess(host: string, durationMs: number): void
  recordConnectionFailure(
    host: string,
    durationMs: number,
    error: unknown
  ): void
}

type QueuedTemporaryImapOperation = {
  operation: () => Promise<unknown>
  priority: ImapOperationPriority
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}

type TemporaryImapLimiterState = {
  active: number
  concurrency: number
  nextStartAt: number
  queue: QueuedTemporaryImapOperation[]
  startIntervalMs: number
  startTimer: ReturnType<typeof setTimeout> | null
}

class TemporaryImapLimiter {
  private readonly states = new Map<string, TemporaryImapLimiterState>()

  run<T>(
    host: string,
    operation: () => Promise<T>,
    priority: ImapOperationPriority
  ) {
    const hostKey = host.trim().toLowerCase()
    let state = this.states.get(hostKey)

    if (!state) {
      state = {
        active: 0,
        concurrency: isBegetImapHost(hostKey) ? 1 : 3,
        nextStartAt: 0,
        queue: [],
        startIntervalMs: 0,
        startTimer: null,
      }
      this.states.set(hostKey, state)
    }

    return new Promise<T>((resolve, reject) => {
      const queuedOperation: QueuedTemporaryImapOperation = {
        operation,
        priority,
        resolve: (value) => resolve(value as T),
        reject,
      }
      const normalPriorityIndex = state.queue.findIndex(
        (queued) => queued.priority === "normal"
      )

      if (priority === "high" && normalPriorityIndex !== -1) {
        state.queue.splice(normalPriorityIndex, 0, queuedOperation)
      } else {
        state.queue.push(queuedOperation)
      }
      this.drain(state)
    })
  }

  private drain(state: TemporaryImapLimiterState) {
    if (state.startTimer) {
      return
    }

    const startDelayMs = Math.max(0, state.nextStartAt - Date.now())

    if (
      state.active < state.concurrency &&
      state.queue.length > 0 &&
      startDelayMs > 0
    ) {
      state.startTimer = setTimeout(() => {
        state.startTimer = null
        this.drain(state)
      }, startDelayMs)
      return
    }

    while (state.active < state.concurrency && state.queue.length > 0) {
      const queued = state.queue.shift()

      if (!queued) {
        return
      }

      state.active += 1
      state.nextStartAt = Date.now() + state.startIntervalMs
      queued
        .operation()
        .then(queued.resolve, queued.reject)
        .finally(() => {
          state.active -= 1
          if (state.startIntervalMs > 0) {
            state.nextStartAt = Date.now() + state.startIntervalMs
          }
          this.drain(state)
        })

      if (state.startIntervalMs > 0) {
        return
      }
    }
  }
}

type ImapOperationPriority = "high" | "normal"

function isBegetImapHost(host: string) {
  return host === "imap.beget.com" || host === "imap.beget.ru"
}

type ImapClientOptions = Pick<
  ImapFlowOptions,
  "maxIdleTime" | "missingIdleCommand" | "socketTimeout"
>

export function createImapClient(
  settings: MailEngineConnectionSettings,
  options: ImapClientOptions = {}
) {
  const isBeget = isBegetMailHost(settings.host)

  return new ImapFlow({
    auth: {
      loginMethod: getImapLoginMethod(settings.host),
      pass: settings.password,
      user: settings.username,
    },
    clientInfo: {
      name: "email-host",
    },
    connectionTimeout: isBeget ? 30_000 : 15_000,
    greetingTimeout: isBeget ? 30_000 : 10_000,
    host: settings.host,
    logger: false,
    port: settings.port,
    secure: settings.secure,
    socketTimeout: isBeget ? 2 * 60 * 1000 : 30_000,
    ...options,
  })
}

async function findUids(
  client: ImapFlow,
  options: FetchMessageMetadataOptions
) {
  const search = {
    ...(options.seen !== undefined ? { seen: options.seen } : {}),
    ...(options.fromUid !== undefined || options.toUid !== undefined
      ? { uid: createUidRange(options.fromUid, options.toUid) }
      : {}),
  }
  const useSequenceSearch =
    options.seen !== undefined &&
    options.fromUid === undefined &&
    options.toUid === undefined
  const searchResult = await client.search(
    search,
    useSequenceSearch ? undefined : { uid: true }
  )
  const matches = Array.isArray(searchResult) ? searchResult : []
  let uids: number[] = []

  if (useSequenceSearch && matches.length > 0) {
    for await (const message of client.fetch(matches, { uid: true })) {
      uids.push(message.uid)
    }
  } else {
    uids.push(...matches)
  }
  if (
    options.seen === false &&
    options.expectedCount !== undefined &&
    uids.length < options.expectedCount
  ) {
    uids = []
    for await (const message of client.fetch("1:*", {
      flags: true,
      uid: true,
    })) {
      if (!hasFlag(message.flags, "\\Seen")) {
        uids.push(message.uid)
      }
    }
  }
  const sortedUids = uids.sort((first, second) => first - second)

  if (!options.limit || options.limit >= sortedUids.length) {
    return sortedUids
  }

  return sortedUids.slice(-options.limit)
}

async function fetchMessageMetadata(
  client: ImapFlow,
  options: FetchMessageMetadataOptions
) {
  const fetchRange =
    options.changedSinceModseq !== undefined &&
    options.fromUid === undefined &&
    options.toUid === undefined &&
    options.seen === undefined &&
    options.limit === undefined
      ? "1:*"
      : await findUids(client, options)

  if (Array.isArray(fetchRange) && fetchRange.length === 0) {
    return []
  }

  const messages: MailEngineMessageMetadataResult[] = []

  for await (const message of client.fetch(
    fetchRange,
    {
      bodyStructure: true,
      envelope: true,
      flags: true,
      headers: ["in-reply-to", "references"],
      internalDate: true,
      labels: true,
      size: true,
      ...(options.includeSource ? { source: true } : {}),
      threadId: true,
      uid: true,
    },
    {
      changedSince: parseModseq(options.changedSinceModseq),
      uid: true,
    }
  )) {
    messages.push({
      ...(await toMessageMetadata(message)),
      ...(message.source ? { source: message.source } : {}),
    })
  }

  return messages.sort((first, second) => first.uid - second.uid)
}

function createUidRange(
  fromUid: number | undefined,
  toUid: number | undefined
) {
  if (fromUid && toUid) {
    return `${fromUid}:${toUid}`
  }

  if (fromUid) {
    return `${fromUid}:*`
  }

  if (toUid) {
    return `1:${toUid}`
  }

  return "1:*"
}

function parseModseq(value: string | undefined) {
  if (!value) {
    return undefined
  }

  try {
    return BigInt(value)
  } catch {
    return undefined
  }
}

function createSmtpTransport(settings: MailEngineConnectionSettings) {
  return nodemailer.createTransport({
    auth: {
      pass: settings.password,
      user: settings.username,
    },
    authMethod: getSmtpAuthMethod(settings.host),
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    host: settings.host,
    logger: false,
    port: settings.port,
    secure: settings.secure,
    socketTimeout: 30_000,
  } satisfies SMTPTransport.Options)
}

async function compileMail(payload: SendMailPayload) {
  const transporter = nodemailer.createTransport({
    buffer: true,
    newline: "windows",
    streamTransport: true,
  })
  const result = await transporter.sendMail(toNodemailerMailOptions(payload))

  if (!Buffer.isBuffer(result.message)) {
    throw new MailEngineError(
      "provider_error",
      "Mail message could not be compiled"
    )
  }

  return {
    envelope: result.envelope,
    messageId: result.messageId,
    source: result.message,
  }
}

function addConnectionContext(error: unknown, protocol: "IMAP" | "SMTP") {
  const normalizedError = normalizeMailEngineError(error)

  return new MailEngineError(
    normalizedError.code,
    getConnectionErrorMessage(protocol, normalizedError.code),
    readErrorCause(normalizedError) ?? error
  )
}

function getConnectionErrorMessage(
  protocol: "IMAP" | "SMTP",
  code: MailEngineErrorCode
) {
  switch (code) {
    case "auth_error":
      return `${protocol} authentication failed`
    case "connect_error":
      return `${protocol} connection failed`
    case "provider_error":
      return `${protocol} provider request failed`
  }
}

function readErrorCause(error: Error) {
  return (error as Error & { cause?: unknown }).cause
}

function getImapLoginMethod(host: string) {
  return isBegetMailHost(host) ? "AUTH=LOGIN" : undefined
}

function getSmtpAuthMethod(host: string) {
  return isBegetMailHost(host) ? "LOGIN" : undefined
}

function isBegetMailHost(host: string) {
  const normalizedHost = host.trim().toLowerCase()

  return (
    normalizedHost === "imap.beget.com" ||
    normalizedHost === "imap.beget.ru" ||
    normalizedHost === "smtp.beget.com" ||
    normalizedHost === "smtp.beget.ru"
  )
}

function isSelectableMailbox(mailbox: ListResponse) {
  return !mailbox.flags.has("\\Noselect")
}

async function closeImapClient(client: ImapFlow) {
  try {
    if (client.usable) {
      await client.logout()
      return
    }
  } catch {
    try {
      client.close()
    } catch {
      return
    }
    return
  }

  try {
    client.close()
  } catch {
    return
  }
}

function toMailbox(mailbox: ListResponse): MailEngineMailbox {
  return {
    path: mailbox.path,
    name: mailbox.name || mailbox.path,
    specialUse: normalizeString(mailbox.specialUse),
    messagesTotal:
      typeof mailbox.status?.messages === "number"
        ? mailbox.status.messages
        : null,
    messagesUnread:
      typeof mailbox.status?.unseen === "number" ? mailbox.status.unseen : null,
    uidValidity: mailbox.status?.uidValidity?.toString() ?? null,
    highestUid:
      typeof mailbox.status?.uidNext === "number"
        ? Math.max(0, mailbox.status.uidNext - 1)
        : null,
    highestModseq: mailbox.status?.highestModseq?.toString() ?? null,
  }
}

function toMailboxStatus(status: StatusObject): MailEngineMailboxStatus {
  return {
    path: status.path,
    messagesTotal: typeof status.messages === "number" ? status.messages : null,
    messagesUnread: typeof status.unseen === "number" ? status.unseen : null,
    uidValidity: status.uidValidity?.toString() ?? null,
    highestUid:
      typeof status.uidNext === "number"
        ? Math.max(0, status.uidNext - 1)
        : null,
    highestModseq: status.highestModseq?.toString() ?? null,
  }
}

async function toMessageMetadata(
  message: FetchMessageObject
): Promise<MailEngineMessageMetadata> {
  const attachments = collectAttachments(message.bodyStructure)
  const sentAt = parseDate(message.envelope?.date)
  const receivedAt = parseDate(message.internalDate)
  const parsedHeaders = message.headers
    ? await simpleParser(message.headers, {
        skipHtmlToText: true,
        skipTextToHtml: true,
      })
    : null

  return {
    uid: message.uid,
    modseq: message.modseq?.toString() ?? null,
    emailId: normalizeString(message.emailId ?? message.id),
    threadId: normalizeString(message.threadId),
    messageId: normalizeString(message.envelope?.messageId),
    inReplyTo: normalizeString(parsedHeaders?.inReplyTo),
    references: normalizeReferences(parsedHeaders?.references),
    subject: normalizeString(message.envelope?.subject),
    from: toImapAddress(message.envelope?.from?.[0]),
    to: toImapAddresses(message.envelope?.to),
    cc: toImapAddresses(message.envelope?.cc),
    bcc: toImapAddresses(message.envelope?.bcc),
    sentAt,
    receivedAt: receivedAt ?? sentAt,
    snippet: null,
    flags: toMessageFlags(message.flags),
    labels: message.labels ? [...message.labels] : [],
    sizeBytes: typeof message.size === "number" ? message.size : null,
    hasAttachments: attachments.length > 0,
    attachments,
  }
}

function normalizeReferences(value: string | string[] | undefined) {
  if (!value) {
    return []
  }

  return (Array.isArray(value) ? value : [value]).flatMap(
    (reference) => reference.match(/<[^>]+>|[^\s]+/g) ?? []
  )
}

function collectAttachments(structure: MessageStructureObject | undefined) {
  const attachments: MailEngineAttachment[] = []
  collectAttachmentNodes(structure, attachments)
  return attachments
}

function collectAttachmentNodes(
  structure: MessageStructureObject | undefined,
  attachments: MailEngineAttachment[]
) {
  if (!structure) {
    return
  }

  const filename =
    normalizeString(structure.dispositionParameters?.filename) ??
    normalizeString(structure.parameters?.name)
  const contentDisposition = normalizeString(structure.disposition)
  const inline = contentDisposition?.toLowerCase() === "inline"
  const contentId = normalizeContentId(structure.id)
  const isAttachment =
    Boolean(filename) ||
    Boolean(contentId) ||
    contentDisposition?.toLowerCase() === "attachment"

  if (isAttachment) {
    attachments.push({
      id: createAttachmentId(attachments.length, {
        contentId,
        contentType: normalizeString(structure.type),
        filename,
        sizeBytes: typeof structure.size === "number" ? structure.size : null,
      }),
      part: normalizeString(structure.part),
      filename,
      contentType: normalizeString(structure.type),
      contentId,
      inline,
      sizeBytes: typeof structure.size === "number" ? structure.size : null,
    })
  }

  for (const child of structure.childNodes ?? []) {
    collectAttachmentNodes(child, attachments)
  }
}

function toParsedAttachment(
  attachment: Attachment,
  index: number
): MailEngineAttachmentContent {
  const metadata = {
    contentId: normalizeContentId(attachment.contentId ?? attachment.cid),
    contentType: normalizeString(attachment.contentType),
    filename: normalizeString(attachment.filename),
    sizeBytes: typeof attachment.size === "number" ? attachment.size : null,
  }

  return {
    ...metadata,
    id: createAttachmentId(index, metadata),
    part: null,
    inline:
      Boolean(attachment.related) ||
      attachment.contentDisposition?.toLowerCase() === "inline",
    content: attachment.content,
  }
}

function createAttachmentId(
  index: number,
  metadata: {
    contentId: string | null
    contentType: string | null
    filename: string | null
    sizeBytes: number | null
  }
) {
  const hash = createHash("sha1")
    .update(
      [
        String(index),
        metadata.filename ?? "",
        metadata.contentType ?? "",
        metadata.contentId ?? "",
        String(metadata.sizeBytes ?? ""),
      ].join("\0")
    )
    .digest("hex")
    .slice(0, 16)

  return `attachment:${index}:${hash}`
}

function toMessageFlags(flags: Set<string> | undefined): MailMessageFlags {
  return {
    answered: hasFlag(flags, "\\Answered"),
    draft: hasFlag(flags, "\\Draft"),
    flagged: hasFlag(flags, "\\Flagged"),
    forwarded: hasFlag(flags, "$Forwarded"),
    seen: hasFlag(flags, "\\Seen"),
  }
}

function hasFlag(flags: Set<string> | undefined, flag: string) {
  if (!flags) {
    return false
  }

  const lowerFlag = flag.toLowerCase()
  return [...flags].some((value) => value.toLowerCase() === lowerFlag)
}

function collectFlagMutation(
  enabled: boolean | undefined,
  flag: string,
  addFlags: string[],
  removeFlags: string[]
) {
  if (typeof enabled !== "boolean") {
    return
  }

  if (enabled) {
    addFlags.push(flag)
    return
  }

  removeFlags.push(flag)
}

function toImapAddresses(
  addresses: MessageAddressObject[] | undefined
): MailAddress[] {
  return (addresses ?? []).map(toImapAddress).filter(isMailAddress)
}

function toImapAddress(
  address: MessageAddressObject | undefined
): MailAddress | null {
  if (!address?.address) {
    return null
  }

  return {
    address: address.address,
    name: normalizeString(address.name),
  }
}

function toParsedAddresses(
  address: AddressObject | AddressObject[] | undefined
) {
  const objects = Array.isArray(address) ? address : address ? [address] : []
  return objects.flatMap((object) =>
    object.value.map(toParsedAddress).filter(isMailAddress)
  )
}

function firstAddressObject(address: AddressObject | undefined) {
  return address?.value[0]
}

function toParsedAddress(
  address: { address?: string; name?: string } | undefined
): MailAddress | null {
  if (!address?.address) {
    return null
  }

  return {
    address: address.address,
    name: normalizeString(address.name),
  }
}

function isMailAddress(address: MailAddress | null): address is MailAddress {
  return address !== null
}

function toNodemailerAddress(address: MailAddress) {
  return {
    address: address.address,
    name: address.name ?? undefined,
  }
}

function toNodemailerMailOptions(payload: SendMailPayload) {
  return {
    attachments: payload.attachments?.map(toNodemailerAttachment),
    bcc: payload.bcc?.map(toNodemailerAddress),
    cc: payload.cc?.map(toNodemailerAddress),
    disableFileAccess: true,
    disableUrlAccess: true,
    from: toNodemailerAddress(payload.from),
    html: payload.html ?? undefined,
    inReplyTo: payload.inReplyTo ?? undefined,
    messageId: payload.messageId ?? undefined,
    references: payload.references,
    subject: payload.subject ?? undefined,
    text: payload.text ?? undefined,
    to: payload.to.map(toNodemailerAddress),
  }
}

function toNodemailerAttachment(
  attachment: NonNullable<SendMailPayload["attachments"]>[number]
) {
  return {
    cid: attachment.contentId ?? undefined,
    content: attachment.content,
    contentDisposition: attachment.inline ? "inline" : "attachment",
    contentType: attachment.contentType ?? undefined,
    filename: attachment.filename ?? undefined,
  } as const
}

function normalizeString(value: string | false | null | undefined) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeContentId(value: string | null | undefined) {
  const normalized = normalizeString(value)
  return normalized?.replace(/^<|>$/g, "") ?? null
}

function parseDate(value: Date | string | undefined) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value !== "string") {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
