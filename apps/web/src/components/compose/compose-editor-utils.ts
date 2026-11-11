import { type UiMessage } from "../ui-message"
import { mailText } from "@workspace/mail-design/locale"
import {
  deserializeHtmlToEditorValue,
  emptyEditorValue,
  serializeEditorValueToHtml,
  type EditorSerializedNode,
  type RichTextEditorRef,
} from "@workspace/editor-ui"
import type {
  MailAddress,
  MailContactDto,
  MailPreferencesDto,
  MailSignatureComposeMode,
  MailSignatureDto,
} from "@/lib/api-client"
import { mailSignatureCustomBlocks } from "./compose-editor-blocks"

export const mailButtonBlockType = "mail-button"
export const mailSignatureBlockType = "mail-signature"

export type ComposeEditorValue = ReturnType<RichTextEditorRef["getValue"]>
export type ComposeAttachment = {
  file: File
  id: string
}
export type SendMessageAttachment = {
  content: string
  contentType?: string | null
  filename?: string | null
}
export type MailSignatureBlockNode = EditorSerializedNode & {
  children: EditorSerializedNode[]
  signatureAccountId?: string
  signatureDirty?: boolean
  signatureHtml?: string
  signatureId?: string
  signatureMode?: MailSignatureComposeMode
  signatureName?: string
  signatureSource?: "auto" | "manual"
  type: typeof mailSignatureBlockType
}
export type MailButtonBlockNode = EditorSerializedNode & {
  buttonText?: string
  buttonTrackClicks?: boolean
  buttonUrl?: string
  children: EditorSerializedNode[]
  type: typeof mailButtonBlockType
}

export function createMailSignatureBlockNode(
  signature: MailSignatureDto | null,
  options: {
    accountId?: string
    mode?: MailSignatureComposeMode
    source?: "auto" | "manual"
  } = {}
): MailSignatureBlockNode {
  return {
    type: mailSignatureBlockType,
    signatureAccountId: options.accountId,
    signatureDirty: false,
    signatureHtml: signature?.html ?? "",
    signatureId: signature?.id,
    signatureMode: options.mode,
    signatureName:
      signature?.name ?? mailText("Основная подпись", "Main signature"),
    signatureSource: options.source ?? "manual",
    children: [{ text: "" }],
  }
}

export function createMailButtonBlockNode(): MailButtonBlockNode {
  return {
    type: mailButtonBlockType,
    buttonText: mailText("Перейти", "Open"),
    buttonTrackClicks: true,
    buttonUrl: "",
    children: [{ text: "" }],
  }
}

export function serializeMailButtonBlock(node: EditorSerializedNode) {
  const url = readString(node.buttonUrl)
  const text = readString(node.buttonText) || mailText("Перейти", "Open")

  if (!url) {
    return ""
  }

  const trackClicks =
    node.buttonTrackClicks === true
      ? ` data-mail-track-click="true" data-mail-track-kind="button"`
      : ""

  return `<p><a href="${escapeAttribute(url)}"${trackClicks} style="display:inline-block;background:#20252a;color:#ffffff;text-decoration:none;padding:10px 16px;font-weight:600">${escapeHtml(text)}</a></p>`
}

export function mailButtonBlockToText(node: EditorSerializedNode) {
  return readString(node.buttonText) || readString(node.buttonUrl)
}

export function serializeMailSignatureBlock(node: EditorSerializedNode) {
  const html = readString(node.signatureHtml)

  return html
    ? `<div data-mail-signature="true" style="margin-top:16px">${html}</div>`
    : ""
}

export function mailSignatureBlockToText(node: EditorSerializedNode) {
  return htmlToPlainText(readString(node.signatureHtml))
}

export function createInitialComposeEditorValue({
  accountId,
  html,
  mode,
  signature,
}: {
  accountId: string
  html: string
  mode: MailSignatureComposeMode
  signature: MailSignatureDto | null
}): ComposeEditorValue {
  const bodyValue = html.trim()
    ? deserializeHtmlToEditorValue(html)
    : cloneEditorValue(emptyEditorValue)
  const signatureNode = signature
    ? createMailSignatureBlockNode(signature, {
        accountId,
        mode,
        source: "auto",
      })
    : null

  if (!signatureNode) {
    return bodyValue
  }

  if (mode === "forward" && html.trim()) {
    return normalizeComposeEditorValue([
      createEmptyParagraphNode(),
      signatureNode,
      ...(bodyValue as EditorSerializedNode[]),
    ])
  }

  if (isEmptyEditorValue(bodyValue)) {
    return normalizeComposeEditorValue([
      createEmptyParagraphNode(),
      signatureNode,
    ])
  }

  return normalizeComposeEditorValue([
    ...(bodyValue as EditorSerializedNode[]),
    signatureNode,
  ])
}

export function replaceAutomaticSignatureBlock({
  accountId,
  mode,
  signature,
  value,
}: {
  accountId: string
  mode: MailSignatureComposeMode
  signature: MailSignatureDto | null
  value: ComposeEditorValue | undefined
}): { changed: boolean; value: ComposeEditorValue } {
  const sourceValue = Array.isArray(value)
    ? (value as EditorSerializedNode[])
    : cloneEditorValue(emptyEditorValue)
  let changed = false
  const nextValue: EditorSerializedNode[] = []

  for (const node of sourceValue) {
    if (isAutomaticSignatureBlockNode(node)) {
      if (
        signature &&
        node.signatureId === signature.id &&
        node.signatureHtml === signature.html &&
        node.signatureAccountId === accountId &&
        node.signatureMode === mode
      ) {
        nextValue.push(node)
        continue
      }

      changed = true

      if (signature) {
        nextValue.push(
          createMailSignatureBlockNode(signature, {
            accountId,
            mode,
            source: "auto",
          })
        )
      }

      continue
    }

    nextValue.push(node)
  }

  return {
    changed,
    value: normalizeComposeEditorValue(nextValue),
  }
}

export function setComposeSignatureBlock({
  accountId,
  mode,
  signature,
  source,
  value,
  withEmptyBlock = false,
}: {
  accountId: string
  mode: MailSignatureComposeMode
  signature: MailSignatureDto | null
  source: "auto" | "manual"
  value: ComposeEditorValue | undefined
  withEmptyBlock?: boolean
}): ComposeEditorValue {
  const sourceValue = Array.isArray(value)
    ? (value as EditorSerializedNode[])
    : cloneEditorValue(emptyEditorValue)
  const signatureNode =
    signature || withEmptyBlock
      ? createMailSignatureBlockNode(signature, {
          accountId,
          mode,
          source,
        })
      : null
  const nextValue: EditorSerializedNode[] = []
  let replaced = false
  let removedSignatureWithoutReplacement = false

  for (const node of sourceValue) {
    if (
      removedSignatureWithoutReplacement &&
      !signatureNode &&
      isEmptyParagraphNode(node)
    ) {
      continue
    }

    removedSignatureWithoutReplacement = false

    if (node.type !== mailSignatureBlockType) {
      nextValue.push(node)
      continue
    }

    if (!replaced && signatureNode) {
      nextValue.push(signatureNode)
      replaced = true
    } else if (!signatureNode) {
      removedSignatureWithoutReplacement = true
    }
  }

  if (!replaced && signatureNode) {
    nextValue.push(signatureNode)
  }

  return normalizeComposeEditorValue(nextValue)
}

export function hasComposeSignatureBlock(
  value: ComposeEditorValue | undefined
) {
  if (!Array.isArray(value)) {
    return false
  }

  return value.some((node) => node.type === mailSignatureBlockType)
}

export function isAutomaticSignatureBlockNode(
  node: EditorSerializedNode
): node is MailSignatureBlockNode {
  return (
    node.type === mailSignatureBlockType &&
    node.signatureSource === "auto" &&
    node.signatureDirty !== true
  )
}

export function normalizeComposeEditorValue(
  value: EditorSerializedNode[]
): ComposeEditorValue {
  const normalizedValue = removeEmptyParagraphsAfterSignature(value)

  return (
    normalizedValue.length ? normalizedValue : [createEmptyParagraphNode()]
  ) as ComposeEditorValue
}

export function serializeComposeEditorValue(value: ComposeEditorValue) {
  return serializeEditorValueToHtml(
    normalizeComposeEditorValue(value as EditorSerializedNode[]),
    mailSignatureCustomBlocks
  )
}

export function removeEmptyParagraphsAfterSignature(
  value: EditorSerializedNode[]
) {
  let signatureIndex = -1

  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (value[index]?.type === mailSignatureBlockType) {
      signatureIndex = index
      break
    }
  }

  if (signatureIndex < 0) {
    return value
  }

  const afterSignature = value.slice(signatureIndex + 1)

  if (
    afterSignature.length === 0 ||
    afterSignature.some((node) => !isEmptyParagraphNode(node))
  ) {
    return value
  }

  return value.slice(0, signatureIndex + 1)
}

export function createEmptyParagraphNode(): EditorSerializedNode {
  return {
    type: "p",
    children: [{ text: "" }],
  }
}

export function cloneEditorValue(
  value: ComposeEditorValue
): ComposeEditorValue {
  return value.map((node) => ({ ...node })) as ComposeEditorValue
}

export function isEmptyEditorValue(value: ComposeEditorValue) {
  return (
    value.length === 1 &&
    isEmptyParagraphNode(value[0] as EditorSerializedNode | undefined)
  )
}

export function isEmptyParagraphNode(node: EditorSerializedNode | undefined) {
  return (
    node?.type === "p" &&
    Array.isArray(node.children) &&
    node.children.length === 1 &&
    node.children[0]?.text === ""
  )
}

export function getSignatureForCompose(
  mailPreferences: MailPreferencesDto,
  accountId: string,
  mode: MailSignatureComposeMode
): MailSignatureDto | null {
  const defaultId = getSignatureDefaultId(mailPreferences, accountId, mode)

  return (
    mailPreferences.signatures.items.find(
      (signature) => signature.id === defaultId
    ) ?? null
  )
}

export function getSignatureDefaultId(
  mailPreferences: MailPreferencesDto,
  accountId: string,
  mode: MailSignatureComposeMode
) {
  const accountDefaults = accountId
    ? mailPreferences.signatures.defaults.accounts[accountId]
    : undefined

  if (accountDefaults && Object.hasOwn(accountDefaults, mode)) {
    return accountDefaults[mode] ?? null
  }

  return mailPreferences.signatures.defaults.global[mode] ?? null
}

export function readString(value: unknown) {
  return typeof value === "string" ? value : ""
}

export function escapeAttribute(value: string) {
  return escapeHtml(value)
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function getCurrentRecipientToken(value: string) {
  const start =
    Math.max(
      value.lastIndexOf(","),
      value.lastIndexOf(";"),
      value.lastIndexOf("\n")
    ) + 1

  return {
    query: value.slice(start).trim(),
    start,
  }
}

export function findContactSuggestions(
  contacts: MailContactDto[],
  query: string,
  committedRecipients: string
) {
  const normalizedQuery = normalizeContactSearchValue(query)

  if (!normalizedQuery) {
    return []
  }

  const selectedAddresses = new Set(
    parseAddressInput(committedRecipients).map((recipient) =>
      normalizeContactSearchValue(recipient.address)
    )
  )

  return contacts
    .map((contact, index) => {
      const address = normalizeContactSearchValue(contact.address)
      const name = normalizeContactSearchValue(contact.name ?? "")
      let matchPriority = Number.POSITIVE_INFINITY

      if (address.startsWith(normalizedQuery)) {
        matchPriority = 0
      } else if (name.startsWith(normalizedQuery)) {
        matchPriority = 1
      } else if (address.includes(normalizedQuery)) {
        matchPriority = 2
      } else if (name.includes(normalizedQuery)) {
        matchPriority = 3
      }

      return {
        contact,
        index,
        matchPriority,
        selected: selectedAddresses.has(address),
      }
    })
    .filter(
      (candidate) =>
        !candidate.selected && Number.isFinite(candidate.matchPriority)
    )
    .sort(
      (left, right) =>
        left.matchPriority - right.matchPriority || left.index - right.index
    )
    .slice(0, 8)
    .map((candidate) => candidate.contact)
}

export function normalizeContactSearchValue(value: string) {
  return value.trim().normalize("NFKC").toLocaleLowerCase()
}

export function getContactInitial(contact: MailContactDto) {
  const source = contact.name?.trim() || contact.address.trim()

  return Array.from(source)[0]?.toLocaleUpperCase() ?? "@"
}

export function parseAddressInput(value: string): MailAddress[] {
  return value
    .split(/[;,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const angleMatch = part.match(/^(.*)<([^>]+)>$/)

      if (angleMatch) {
        return {
          name: angleMatch[1]?.trim().replace(/^"|"$/g, "") || null,
          address: angleMatch[2]?.trim() ?? "",
        }
      }

      return {
        address: part,
      }
    })
    .filter((address) => address.address.includes("@"))
}

export async function fileToSendMessageAttachment(
  attachment: ComposeAttachment
): Promise<SendMessageAttachment> {
  return {
    content: arrayBufferToBase64(await attachment.file.arrayBuffer()),
    contentType: attachment.file.type || null,
    filename: attachment.file.name || null,
  }
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ""

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }

  return window.btoa(binary)
}

export function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
}

export function getErrorMessage(error: unknown): UiMessage {
  if (error instanceof Error) {
    return error.message
  }

  return ["Неизвестная ошибка", "Unknown error"]
}
