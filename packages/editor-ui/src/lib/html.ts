import {
  defaultEditorLabels,
  type RichTextEditorLabels,
} from "../components/editor-labels"
import { deserializeMd, serializeMd } from "@platejs/markdown"
import { createSlateEditor, KEYS, type Value } from "platejs"
import { getEditorDOMFromHtmlString } from "platejs/static"

import { BaseBlockEditorKit } from "./block-editor-kit"
import type { EditorCustomBlock, EditorSerializedNode } from "../types/editor"

export const emptyEditorValue: Value = [
  {
    type: KEYS.p,
    children: [{ text: "" }],
  },
]

type EditorNode = EditorSerializedNode & {
  children?: EditorNode[]
  type?: string
  text?: string
  url?: string
  target?: string
  trackClicks?: boolean
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean
  highlight?: boolean
  kbd?: boolean
  listStyleType?: string
  subscript?: boolean
  superscript?: boolean
  indent?: number
  lang?: string
  mediaType?: string
  name?: string
}

export function deserializeHtmlToEditorValue(
  html: string | null | undefined
): Value {
  if (!html?.trim()) {
    return emptyEditorValue
  }

  try {
    const editor = createSlateEditor({
      plugins: BaseBlockEditorKit,
    })
    const element = getEditorDOMFromHtmlString(html)
    const nodes = editor.api.html.deserialize({ element }) as Value

    return normalizeEditorValue(nodes)
  } catch {
    return normalizeEditorValue([
      {
        type: KEYS.p,
        children: [{ text: stripHtml(html) }],
      },
    ])
  }
}

export function serializeEditorValueToHtml(
  value: Value,
  customBlocks: EditorCustomBlock[] = [],
  labels: Pick<RichTextEditorLabels, "file"> = defaultEditorLabels
): string {
  const nodes = normalizeEditorValue(value) as EditorNode[]
  const customBlocksByType = new Map(
    customBlocks.map((block) => [block.type, block])
  )
  const html: string[] = []
  let index = 0

  while (index < nodes.length) {
    const node = nodes[index]!

    if (node.listStyleType) {
      const listStyleType = node.listStyleType
      const listItems: EditorNode[] = []

      while (nodes[index]?.listStyleType === listStyleType) {
        listItems.push(nodes[index]!)
        index += 1
      }

      html.push(serializeList(listStyleType, listItems))
      continue
    }

    html.push(
      serializeBlock(
        node,
        customBlocksByType,
        labels.file ?? defaultEditorLabels.file
      )
    )
    index += 1
  }

  return html.join("")
}

export function deserializeMarkdownToEditorValue(
  markdown: string | null | undefined
): Value {
  if (!markdown?.trim()) {
    return emptyEditorValue
  }

  try {
    const editor = createSlateEditor({
      plugins: BaseBlockEditorKit,
    })

    return normalizeEditorValue(deserializeMd(editor, markdown))
  } catch {
    return [
      {
        type: KEYS.p,
        children: [{ text: markdown }],
      },
    ]
  }
}

export function serializeEditorValueToMarkdown(value: Value): string {
  try {
    const editor = createSlateEditor({
      plugins: BaseBlockEditorKit,
      value: normalizeEditorValue(value),
    })

    return serializeMd(editor)
  } catch {
    return editorValueToPlainText(value)
  }
}

export function editorValueToPlainText(
  value: Value,
  customBlocks: EditorCustomBlock[] = []
): string {
  const customBlocksByType = new Map(
    customBlocks.map((block) => [block.type, block])
  )

  return normalizeEditorValue(value)
    .map((node) => collectPlainText(node as EditorNode, customBlocksByType))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function normalizeEditorValue(value: Value): Value {
  const nodes =
    Array.isArray(value) && value.length > 0 ? value : emptyEditorValue
  const normalizedNodes = (nodes as EditorNode[]).flatMap((node) =>
    splitTextBlockByLineBreaks(node)
  )

  return normalizedNodes.length > 0
    ? (normalizedNodes as Value)
    : emptyEditorValue
}

function splitTextBlockByLineBreaks(node: EditorNode): EditorNode[] {
  if (!shouldSplitTextBlockByLineBreaks(node)) {
    return [node]
  }

  return splitInlineChildrenByLineBreaks(node.children).map((children) => ({
    ...node,
    children,
  }))
}

function shouldSplitTextBlockByLineBreaks(node: EditorNode): boolean {
  if (!node.children?.length || !containsTextLineBreak(node)) {
    return false
  }

  return (
    Boolean(node.listStyleType) ||
    node.type === KEYS.p ||
    node.type === KEYS.h1 ||
    node.type === KEYS.h2 ||
    node.type === KEYS.h3 ||
    node.type === KEYS.h4 ||
    node.type === KEYS.h5 ||
    node.type === KEYS.h6 ||
    node.type === KEYS.blockquote
  )
}

function splitInlineChildrenByLineBreaks(
  children: EditorNode[] | undefined
): EditorNode[][] {
  const lines: EditorNode[][] = [[]]

  for (const child of children ?? []) {
    if (typeof child.text === "string") {
      const parts = child.text.replace(/\r\n?/g, "\n").split("\n")

      parts.forEach((part, index) => {
        if (index > 0) {
          lines.push([])
        }

        if (part || parts.length === 1) {
          lines[lines.length - 1]!.push({ ...child, text: part })
        }
      })
      continue
    }

    if (containsTextLineBreak(child)) {
      const childLines = splitInlineChildrenByLineBreaks(child.children)

      childLines.forEach((line, index) => {
        if (index > 0) {
          lines.push([])
        }

        lines[lines.length - 1]!.push({ ...child, children: line })
      })
      continue
    }

    lines[lines.length - 1]!.push(child)
  }

  return lines.map((line) => (line.length > 0 ? line : [{ text: "" }]))
}

function containsTextLineBreak(node: EditorNode): boolean {
  if (typeof node.text === "string") {
    return /\r|\n/.test(node.text)
  }

  return (node.children ?? []).some(containsTextLineBreak)
}

function serializeList(listStyleType: string, items: EditorNode[]) {
  const ordered = isOrderedListStyle(listStyleType)
  const tag = ordered ? "ol" : "ul"
  const style = listStyleType
    ? ` style="list-style-type:${escapeAttribute(listStyleType)}"`
    : ""

  return `<${tag}${style}>${items
    .map((item) => {
      const indent = Math.max(1, Number(item.indent ?? 1))
      const indentStyle =
        indent > 1 ? ` style="margin-left:${(indent - 1) * 24}px"` : ""

      return `<li${indentStyle}>${serializeChildren(item.children)}</li>`
    })
    .join("")}</${tag}>`
}

function serializeBlock(
  node: EditorNode,
  customBlocksByType: Map<string, EditorCustomBlock>,
  fileLabel: string
): string {
  if (node.type) {
    const customBlock = customBlocksByType.get(node.type)

    if (customBlock?.serializeHtml) {
      return customBlock.serializeHtml(node)
    }
  }

  const children = serializeChildren(node.children)

  if (node.type === KEYS.h2) {
    return `<h2>${children}</h2>`
  }

  if (node.type === KEYS.h3) {
    return `<h3>${children}</h3>`
  }

  if (node.type === KEYS.h1) {
    return `<h1>${children}</h1>`
  }

  if (node.type === KEYS.h4) {
    return `<h4>${children}</h4>`
  }

  if (node.type === KEYS.h5) {
    return `<h5>${children}</h5>`
  }

  if (node.type === KEYS.h6) {
    return `<h6>${children}</h6>`
  }

  if (node.type === KEYS.blockquote) {
    return `<blockquote>${children}</blockquote>`
  }

  if (node.type === KEYS.hr) {
    return "<hr>"
  }

  if (node.type === KEYS.codeBlock) {
    return serializeCodeBlock(node)
  }

  if (node.type === KEYS.table) {
    return serializeTable(node)
  }

  if (node.type === KEYS.img) {
    return serializeImage(node)
  }

  if (node.type === KEYS.file) {
    return serializeFile(node, fileLabel)
  }

  if (node.type === KEYS.mediaEmbed) {
    return serializeMediaEmbed(node)
  }

  return `<p>${children || "<br>"}</p>`
}

function serializeCodeBlock(node: EditorNode) {
  const code = (node.children ?? []).map(collectText).join("\n")
  const languageClass = node.lang
    ? ` class="language-${escapeAttribute(node.lang)}"`
    : ""

  return `<pre><code${languageClass}>${escapeHtml(code)}</code></pre>`
}

function serializeTable(node: EditorNode) {
  const rows = (node.children ?? [])
    .filter((row) => row.type === KEYS.tr)
    .map(
      (row) =>
        `<tr>${(row.children ?? [])
          .map((cell) => {
            const tag = cell.type === KEYS.th ? "th" : "td"

            return `<${tag}>${serializeChildren(readCellChildren(cell))}</${tag}>`
          })
          .join("")}</tr>`
    )
    .join("")

  return rows ? `<table><tbody>${rows}</tbody></table>` : ""
}

function readCellChildren(cell: EditorNode) {
  const firstChild = cell.children?.[0]

  if (firstChild?.type === KEYS.p) {
    return firstChild.children
  }

  return cell.children
}

function serializeImage(node: EditorNode) {
  if (!node.url) {
    return ""
  }

  return `<p><img src="${escapeAttribute(node.url)}" alt=""></p>`
}

function serializeFile(node: EditorNode, fileLabel: string) {
  const name = escapeHtml(node.name || fileLabel)

  if (!node.url) {
    return `<p>${name}</p>`
  }

  return `<p><a href="${escapeAttribute(node.url)}">${name}</a></p>`
}

function serializeMediaEmbed(node: EditorNode) {
  if (!node.url) {
    return ""
  }

  const url = escapeAttribute(node.url)

  return `<p><a href="${url}">${escapeHtml(node.url)}</a></p>`
}

function serializeChildren(children: EditorNode[] | undefined): string {
  return (children ?? []).map(serializeInline).join("")
}

function serializeInline(node: EditorNode): string {
  if (typeof node.text === "string") {
    let text = escapeHtml(node.text).replace(/\n/g, "<br>")

    if (node.code) {
      text = `<code>${text}</code>`
    }

    if (node.kbd) {
      text = `<kbd>${text}</kbd>`
    }

    if (node.bold) {
      text = `<strong>${text}</strong>`
    }

    if (node.italic) {
      text = `<em>${text}</em>`
    }

    if (node.underline) {
      text = `<u>${text}</u>`
    }

    if (node.strikethrough) {
      text = `<s>${text}</s>`
    }

    if (node.subscript) {
      text = `<sub>${text}</sub>`
    }

    if (node.superscript) {
      text = `<sup>${text}</sup>`
    }

    if (node.highlight) {
      text = `<mark>${text}</mark>`
    }

    return text
  }

  const children = serializeChildren(node.children)

  if (node.type === KEYS.link && node.url) {
    const href = escapeAttribute(node.url)
    const target = node.target
      ? ` target="${escapeAttribute(node.target)}"`
      : ""
    const trackClicks = node.trackClicks
      ? ` data-mail-track-click="true" data-mail-track-kind="link"`
      : ""

    return `<a href="${href}"${target}${trackClicks}>${children}</a>`
  }

  return children
}

function collectText(node: EditorNode): string {
  if (typeof node.text === "string") {
    return node.text
  }

  return (node.children ?? []).map(collectText).join("")
}

function collectPlainText(
  node: EditorNode,
  customBlocksByType: Map<string, EditorCustomBlock>
): string {
  if (node.type) {
    const customBlock = customBlocksByType.get(node.type)

    if (customBlock?.toText) {
      return customBlock.toText(node)
    }
  }

  return collectText(node)
}

function isOrderedListStyle(listStyleType: string) {
  return (
    listStyleType === "decimal" ||
    listStyleType === "lower-alpha" ||
    listStyleType === "upper-alpha" ||
    listStyleType === "lower-roman" ||
    listStyleType === "upper-roman"
  )
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/g, "&quot;")
}
