const snippetLength = 180

const invisiblePreviewEntityPattern =
  /&(?:amp;)*(?:zwnj|zwj|zerowidthspace|negative(?:verythin|thin|medium|thick)space|shy);/gi
const invisiblePreviewNumericEntityPattern =
  /&(?:amp;)*#(?:x(?:ad|200b|200c|200d|2060|feff)|(?:173|8203|8204|8205|8288|65279));/gi
const previewWhitespaceEntityPattern =
  /&(?:amp;)*(?:nbsp|ensp|emsp|thinsp|hairsp|#(?:x(?:a0|2002|2003|2009|200a)|(?:160|8194|8195|8201|8202)));/gi

const namedHtmlEntities: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "…",
  laquo: "«",
  lt: "<",
  mdash: "—",
  nbsp: " ",
  ndash: "–",
  quot: '"',
  raquo: "»",
  zwnj: "",
}

export function htmlToPlainText(html: string | null) {
  if (!html) return null

  const text = decodeHtmlEntities(
    html
      .replace(/<!--[^]*?-->/g, " ")
      .replace(
        /<(head|style|script|noscript|template|svg)\b[^>]*>[^]*?<\/\1\s*>/gi,
        " "
      )
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(
        /<\/(?:address|blockquote|div|h[1-6]|li|p|pre|table|tr)>/gi,
        "\n"
      )
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return text || null
}

export function createMailSnippet(text: string | null, html: string | null) {
  const content = isHtml(text) ? htmlToPlainText(text) : text
  const readable = content?.trim() || htmlToPlainText(html)

  if (!readable) return null

  const compact = normalizeMailPreviewText(readable)

  if (!compact) return null

  return compact.length > snippetLength
    ? `${compact.slice(0, snippetLength - 3)}...`
    : compact
}

export function normalizeMailPreviewText(value: string | null) {
  if (!value) return null

  const normalized = value
    .replace(invisiblePreviewEntityPattern, "")
    .replace(invisiblePreviewNumericEntityPattern, "")
    .replace(previewWhitespaceEntityPattern, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[\u00ad\u200b\u200c\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()

  return normalized || null
}

function isHtml(value: string | null) {
  return Boolean(
    value &&
    /<(?:!doctype|html|head|body|meta|style|script|title|div|p|br|table|tr|td|span|a)\b[^>]*>/i.test(
      value
    )
  )
}

function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(#(?:x[\da-f]+|\d+)|[a-z][a-z\d]+);/gi,
    (entity, code: string) => {
      if (code[0] !== "#") {
        return namedHtmlEntities[code.toLowerCase()] ?? entity
      }

      const hexadecimal = code[1]?.toLowerCase() === "x"
      const valueStart = hexadecimal ? 2 : 1
      const codePoint = Number.parseInt(
        code.slice(valueStart),
        hexadecimal ? 16 : 10
      )

      if (
        !Number.isFinite(codePoint) ||
        codePoint <= 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return entity
      }

      return String.fromCodePoint(codePoint)
    }
  )
}
