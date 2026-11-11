export type MailtoComposeRequest = {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
}

const maximumMailtoUrlLength = 64 * 1024

export function parseMailtoUrl(value: string): MailtoComposeRequest | null {
  if (value.length > maximumMailtoUrlLength) {
    return null
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol.toLowerCase() !== "mailto:") {
    return null
  }

  const headers = new Map<string, string[]>()

  for (const [key, headerValue] of url.searchParams) {
    const normalizedKey = key.toLowerCase()
    const values = headers.get(normalizedKey) ?? []
    values.push(headerValue)
    headers.set(normalizedKey, values)
  }

  const pathRecipients = safeDecodeURIComponent(url.pathname)

  return {
    to: joinRecipientValues([pathRecipients, ...(headers.get("to") ?? [])]),
    cc: joinRecipientValues(headers.get("cc") ?? []),
    bcc: joinRecipientValues(headers.get("bcc") ?? []),
    subject: normalizeHeaderValue(headers.get("subject")?.[0] ?? ""),
    body: normalizeBody(headers.get("body")?.[0] ?? ""),
  }
}

export function plainTextToComposeHtml(text: string) {
  if (!text) {
    return ""
  }

  return text
    .split(/\n{2,}/)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`
    )
    .join("")
}

function joinRecipientValues(values: string[]) {
  return values
    .flatMap((value) => value.split(/[;,]/))
    .map((value) => normalizeHeaderValue(value).trim())
    .filter(Boolean)
    .join(", ")
}

function normalizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ")
}

function normalizeBody(value: string) {
  return value.replace(/\r\n?/g, "\n")
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return ""
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
