import { createHash, randomUUID } from "node:crypto"

import { internal } from "../../../../convex/_generated/api"
import type { Doc, Id } from "../../../../convex/_generated/dataModel"
import type { OutboundMessageDto, SendMessageRequest } from "../contracts"
import type { MailAgentConvexClient } from "../convex/client"
import { htmlToPlainText } from "../mail-content"
import {
  MailEngineError,
  type MailEngine,
  type SendMailPayload,
} from "../mail-engine"
import { findMailAccountCredentials } from "./mail-account-credentials"

type SyncAccountMessages = (
  accountId: Id<"mailAccounts">,
  params: {
    path?: string
    pageSize?: number
    pageLimit?: number
  }
) => Promise<unknown>

export class OutboundPayloadConflictError extends Error {
  constructor() {
    super("Client request id is already used for another send payload")
    this.name = "OutboundPayloadConflictError"
  }
}

export class MailSendService {
  private readonly convex: MailAgentConvexClient
  private readonly mailEngine: MailEngine
  private readonly mailCredentialSecret: string
  private readonly appBaseUrl: string
  private readonly syncAccountMessages: SyncAccountMessages

  constructor(
    convex: MailAgentConvexClient,
    mailEngine: MailEngine,
    mailCredentialSecret: string,
    appBaseUrl: string,
    syncAccountMessages: SyncAccountMessages
  ) {
    this.convex = convex
    this.mailEngine = mailEngine
    this.mailCredentialSecret = mailCredentialSecret
    this.appBaseUrl = appBaseUrl
    this.syncAccountMessages = syncAccountMessages
  }

  async sendMessage(
    userId: Id<"users">,
    request: SendMessageRequest
  ): Promise<OutboundMessageDto | null> {
    const account = await this.convex.query(
      internal.accountsInternal.getByPublicId,
      { userId, publicId: request.accountId }
    )
    if (!account) return null

    const trackOpens = request.trackOpens ?? false
    const payload = await this.buildSendPayload(userId, request, account)
    const trackClicks = hasTrackedClickLinks(payload.html)
    const payloadHash = hashSendPayload({ payload, trackOpens, trackClicks })
    const prepared = await this.convex.mutation(
      internal.outboundInternal.prepare,
      {
        userId,
        accountPublicId: request.accountId,
        clientRequestId: request.clientRequestId,
        publicId: randomUUID(),
        payloadHash,
        trackOpens,
        trackClicks,
      }
    )

    if (prepared.kind === "account_not_found") return null
    if (prepared.kind === "conflict") {
      throw new OutboundPayloadConflictError()
    }
    if (prepared.kind === "existing") {
      return toOutboundMessageDto(prepared.outbound, prepared.account.publicId)
    }

    const { outbound } = prepared
    const credentials = await findMailAccountCredentials(
      this.convex,
      account._id,
      this.mailCredentialSecret
    )
    if (!credentials) {
      throw new MailEngineError(
        "connect_error",
        "Mail account credentials are missing"
      )
    }

    try {
      await this.convex.mutation(internal.outboundInternal.setStatus, {
        outboundId: outbound._id,
        status: "submitting",
      })
      const finalPayload = await this.addOutboundMetadata(
        payload,
        outbound._id,
        outbound.publicId,
        trackOpens,
        trackClicks
      )
      const response = await this.mailEngine.sendMail(credentials, finalPayload)
      if (response.rejected.length > 0 && response.accepted.length === 0) {
        throw new MailEngineError(
          "provider_error",
          "Mail provider rejected all recipients"
        )
      }

      const sent = await this.convex.mutation(
        internal.outboundInternal.setStatus,
        {
          outboundId: outbound._id,
          status: "sent",
          emailengineQueueId: response.response ?? undefined,
          emailengineMessageId: response.messageId ?? undefined,
        }
      )
      await this.saveSentMessage(
        account._id,
        credentials,
        response.source,
        response.messageId
      ).catch((error) => {
        console.error("Sent mailbox sync failed", {
          accountId: account._id,
          message: getSafeSendErrorMessage(error),
        })
      })
      return sent ? toOutboundMessageDto(sent, account.publicId) : null
    } catch (error) {
      const failed = await this.convex.mutation(
        internal.outboundInternal.setStatus,
        {
          outboundId: outbound._id,
          status: "failed",
          lastError: getSafeSendErrorMessage(error),
        }
      )
      return failed ? toOutboundMessageDto(failed, account.publicId) : null
    }
  }

  recordOpen(outboundPublicId: string) {
    return this.convex.mutation(internal.outboundInternal.recordOpen, {
      outboundPublicId,
    })
  }

  recordClick(linkPublicId: string) {
    return this.convex.mutation(internal.outboundInternal.recordClick, {
      linkPublicId,
    })
  }

  private async buildSendPayload(
    userId: Id<"users">,
    request: SendMessageRequest,
    account: Doc<"mailAccounts">
  ): Promise<SendMailPayload> {
    const reference = request.referenceMessageId
      ? await this.convex.query(internal.outboundInternal.getReference, {
          userId,
          messagePublicId: request.referenceMessageId,
        })
      : null
    const html = normalizeNullableString(request.html)
    const text = normalizeNullableString(request.text) ?? htmlToPlainText(html)
    const attachments = request.attachments?.map(toSendMailAttachment)

    return {
      from: {
        address: account.address,
        name: account.displayName,
      },
      to: request.to,
      cc: request.cc,
      bcc: request.bcc,
      subject: request.subject,
      text: text ?? "",
      html: html ?? textToHtml(text ?? ""),
      attachments: attachments?.length ? attachments : undefined,
      inReplyTo:
        reference && request.mode === "reply"
          ? reference.internetMessageId
          : undefined,
      references:
        reference && request.mode === "reply" && reference.internetMessageId
          ? [reference.internetMessageId]
          : undefined,
    }
  }

  private async saveSentMessage(
    accountId: Id<"mailAccounts">,
    credentials: Parameters<MailEngine["appendSentMessage"]>[0],
    source: Buffer,
    messageId: string | null
  ) {
    const sentMailbox = await this.convex.query(
      internal.outboundInternal.getSentMailbox,
      { accountId }
    )
    if (!sentMailbox) return

    await this.mailEngine
      .appendSentMessage(credentials, sentMailbox.path, source, messageId)
      .catch((error) => {
        console.error("Sent mailbox copy failed", {
          accountId,
          message: getSafeSendErrorMessage(error),
        })
      })
    await this.syncAccountMessages(accountId, {
      path: sentMailbox.path,
      pageSize: 10,
      pageLimit: 1,
    }).catch(() => undefined)
  }

  private async addOutboundMetadata(
    payload: SendMailPayload,
    outboundId: Id<"outboundMessages">,
    outboundPublicId: string,
    trackOpens: boolean,
    trackClicks: boolean
  ): Promise<SendMailPayload> {
    let html = payload.html
    if (trackClicks) {
      html = await this.rewriteTrackedClickLinks(
        html ?? textToHtml(payload.text ?? ""),
        outboundId
      )
    }
    if (trackOpens) {
      html = appendOpenTrackingPixel(
        html ?? textToHtml(payload.text ?? ""),
        this.buildOpenTrackingUrl(outboundPublicId)
      )
    }
    return {
      ...payload,
      html,
      messageId: createMessageId(outboundPublicId, this.appBaseUrl),
    }
  }

  private async rewriteTrackedClickLinks(
    html: string,
    outboundId: Id<"outboundMessages">
  ) {
    const parts: string[] = []
    const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
    let cursor = 0

    for (const match of html.matchAll(anchorPattern)) {
      const anchor = match[0]
      const rawAttributes = match[1] ?? ""
      const content = match[2] ?? ""
      const index = match.index ?? 0
      parts.push(html.slice(cursor, index))
      cursor = index + anchor.length

      if (!hasTrackClickAttribute(rawAttributes)) {
        parts.push(anchor)
        continue
      }
      const url = readHtmlAttribute(rawAttributes, "href")
      if (!url) {
        parts.push(anchor.replace(removeTrackClickAttributesPattern, ""))
        continue
      }

      const label =
        (htmlToPlainText(content) ?? "").slice(0, 240) || url.slice(0, 240)
      const elementType =
        readHtmlAttribute(rawAttributes, "data-mail-track-kind") === "button"
          ? "button"
          : "link"
      const linkPublicId = randomUUID()
      const nextAttributes = setHtmlAttribute(
        rawAttributes.replace(removeTrackClickAttributesPattern, ""),
        "href",
        this.buildClickTrackingUrl(linkPublicId)
      )
      await this.convex.mutation(internal.outboundInternal.addClickLink, {
        publicId: linkPublicId,
        outboundId,
        url,
        label,
        elementType,
      })
      parts.push(
        `<a${nextAttributes} data-mail-tracked-link="${escapeHtml(linkPublicId)}">${content}</a>`
      )
    }

    parts.push(html.slice(cursor))
    return parts.join("")
  }

  private buildOpenTrackingUrl(outboundPublicId: string) {
    return new URL(
      `/api/mail/tracking/open/${outboundPublicId}`,
      this.appBaseUrl
    ).toString()
  }

  private buildClickTrackingUrl(linkPublicId: string) {
    return new URL(
      `/api/mail/tracking/click/${linkPublicId}`,
      this.appBaseUrl
    ).toString()
  }
}

function toOutboundMessageDto(
  message: Doc<"outboundMessages">,
  accountPublicId: string
): OutboundMessageDto {
  return {
    id: message.publicId,
    accountId: accountPublicId,
    clientRequestId: message.clientRequestId,
    status: message.status,
    trackOpens: message.trackOpens,
    trackClicks: message.trackClicks,
    openCount: message.openCount,
    firstOpenedAt: normalizeDate(message.firstOpenedAt),
    lastOpenedAt: normalizeDate(message.lastOpenedAt),
    clickCount: message.clickCount,
    firstClickedAt: normalizeDate(message.firstClickedAt),
    lastClickedAt: normalizeDate(message.lastClickedAt),
    lastError: message.lastError ?? null,
  }
}

function hashSendPayload(value: {
  payload: SendMailPayload
  trackOpens: boolean
  trackClicks: boolean
}) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function getSafeSendErrorMessage(error: unknown) {
  return error instanceof MailEngineError ? error.message : "Send failed"
}

function normalizeNullableString(value: string | undefined | null) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toSendMailAttachment(
  attachment: NonNullable<SendMessageRequest["attachments"]>[number]
) {
  return {
    filename: attachment.filename ?? null,
    contentType: attachment.contentType ?? null,
    content: Buffer.from(attachment.content, "base64"),
  }
}

const removeTrackClickAttributesPattern =
  /\sdata-mail-track-(?:click|kind)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?/gi

function hasTrackedClickLinks(html: string | null | undefined) {
  return Boolean(html && /data-mail-track-click\s*=\s*["']?true/i.test(html))
}

function hasTrackClickAttribute(attributes: string) {
  return readHtmlAttribute(attributes, "data-mail-track-click") === "true"
}

function readHtmlAttribute(attributes: string, name: string) {
  const match = new RegExp(
    `\\s${escapeRegExp(name)}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?`,
    "i"
  ).exec(attributes)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null
}

function setHtmlAttribute(attributes: string, name: string, value: string) {
  const pattern = new RegExp(
    `(\\s${escapeRegExp(name)})(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+))?`,
    "i"
  )
  const next = ` ${name}="${escapeHtml(value)}"`
  return pattern.test(attributes)
    ? attributes.replace(pattern, next)
    : `${attributes.trimEnd()}${next}`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("")
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function appendOpenTrackingPixel(html: string, trackingUrl: string) {
  return `${html}<img src="${escapeHtml(trackingUrl)}" width="1" height="1" alt="" style="width:1px;height:1px;border:0;opacity:0" />`
}

function createMessageId(outboundPublicId: string, appBaseUrl: string) {
  const hostname = new URL(appBaseUrl).hostname || "email-host.local"
  return `<${outboundPublicId}@${hostname}>`
}

function normalizeDate(value: number | undefined) {
  return value === undefined ? null : new Date(value).toISOString()
}
