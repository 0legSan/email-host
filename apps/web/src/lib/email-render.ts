export type EmailRenderMode = "auto" | "original" | "dark"

export type EmailRenderResult = {
  backgroundColor: string | null
  document: string
}

const emailRenderStrategyVersion = 4
const darkPageBackground = "#101214"
const darkContentBackground = "#15191d"
const darkTextColor = "#e8edf2"
const darkMutedColor = "#a7b0ba"
const darkLinkColor = "#7db7ff"
const darkBorderColor = "#30363d"

type RgbColor = {
  b: number
  g: number
  r: number
}

export function createEmailRenderCacheKey(
  messageId: string,
  html: string,
  dark: boolean,
  mode: EmailRenderMode
) {
  return `${emailRenderStrategyVersion}:${messageId}:${dark ? "dark" : "light"}:${mode}:${hashText(html)}`
}

export function buildEmailHtmlDocument(
  html: string,
  dark: boolean,
  mode: EmailRenderMode
): EmailRenderResult {
  const document = new DOMParser().parseFromString(html, "text/html")

  sanitizeEmailDocument(document)

  const sourceBackgroundColor = getEmailBackgroundColor(document)
  const useDarkEmailStyles = shouldUseDarkEmailStyles(
    document,
    dark,
    mode,
    sourceBackgroundColor
  )

  if (useDarkEmailStyles) {
    adaptEmailDocumentForDarkMode(document, mode === "dark")
  }

  const pageBackground = useDarkEmailStyles
    ? darkPageBackground
    : (sourceBackgroundColor ?? (dark ? darkPageBackground : "#ffffff"))
  const contentBackground = useDarkEmailStyles
    ? darkContentBackground
    : (sourceBackgroundColor ?? (dark ? darkContentBackground : "#ffffff"))
  const textColor = useDarkEmailStyles
    ? darkTextColor
    : sourceBackgroundColor
      ? getReadableTextColor(sourceBackgroundColor)
      : dark
        ? darkTextColor
        : "#20252a"
  const mutedColor = useDarkEmailStyles ? darkMutedColor : "#52606d"
  const linkColor = useDarkEmailStyles ? darkLinkColor : "#1769aa"
  const borderColor = useDarkEmailStyles ? darkBorderColor : "#d5dee8"

  return {
    backgroundColor: useDarkEmailStyles ? null : sourceBackgroundColor,
    document: `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <base target="_blank">
    <style>
      :root { color-scheme: ${dark ? "dark" : "light"}; }
      html, body {
        margin: 0;
        padding: 0;
        background: ${pageBackground};
        color: ${textColor};
        font-family: Arial, Helvetica, sans-serif;
        font-size: 15px;
        line-height: 1.55;
      }
      body {
        overflow: auto;
        scrollbar-width: thin;
        scrollbar-color: ${dark ? "#4a535d" : "#b7c2cc"} transparent;
      }
      body::-webkit-scrollbar { width: 10px; height: 10px; }
      body::-webkit-scrollbar-track { background: transparent; }
      body::-webkit-scrollbar-thumb {
        background: ${dark ? "#4a535d" : "#b7c2cc"};
        border: 2px solid transparent;
        border-radius: 999px;
        background-clip: content-box;
      }
      .email-root {
        box-sizing: border-box;
        width: 100%;
        max-width: none;
        min-height: 100vh;
        margin: 0;
        padding: 24px;
        background: ${contentBackground};
        overflow-wrap: anywhere;
      }
      .email-root, .email-root * { box-sizing: border-box; }
      a {
        color: ${linkColor};
        text-decoration: underline;
        word-break: break-word;
      }
      img {
        max-width: 100% !important;
        height: auto !important;
        vertical-align: middle;
      }
      table {
        max-width: 100% !important;
        border-collapse: collapse;
      }
      td, th { vertical-align: top; }
      pre {
        max-width: 100%;
        overflow: auto;
        white-space: pre-wrap;
      }
      blockquote {
        margin: 1em 0;
        padding-left: 1em;
        border-left: 3px solid ${borderColor};
        color: ${mutedColor};
      }
      ${useDarkEmailStyles ? darkEmailCss() : ""}
      @media (max-width: 720px) {
        .email-root {
          max-width: 100%;
          min-width: 0;
          padding: 16px;
          overflow-x: hidden;
        }
        .email-root * {
          min-width: 0 !important;
          max-width: 100% !important;
        }
        table {
          width: 100% !important;
          table-layout: auto !important;
        }
        td, th {
          width: auto !important;
          height: auto !important;
        }
        img { width: auto !important; }
        .email-root :where(td, th, p, div, span, a, li) {
          overflow-wrap: anywhere !important;
          white-space: normal !important;
        }
      }
    </style>
  </head>
  <body>
    <main class="email-root">${document.body.innerHTML}</main>
  </body>
</html>`,
  }
}

function shouldUseDarkEmailStyles(
  document: Document,
  dark: boolean,
  mode: EmailRenderMode,
  sourceBackgroundColor: string | null
) {
  if (!dark || mode === "original") {
    return false
  }

  if (mode === "dark") {
    return true
  }

  if (hasNativeDarkMode(document)) {
    return false
  }

  if (!sourceBackgroundColor) {
    return true
  }

  const rgb = parseCssColorRgb(sourceBackgroundColor)

  if (!rgb) {
    return true
  }

  return getLuminance(rgb) > 0.52
}

function hasNativeDarkMode(document: Document) {
  const html = document.documentElement.innerHTML.toLowerCase()

  return (
    html.includes("prefers-color-scheme") ||
    html.includes("color-scheme") ||
    html.includes("data-ogsc") ||
    html.includes("data-ogsb")
  )
}

function adaptEmailDocumentForDarkMode(document: Document, force: boolean) {
  document.body.querySelectorAll("*").forEach((element) => {
    if (!(element instanceof HTMLElement)) {
      return
    }

    adaptElementBackground(element, force)
    adaptElementTextColor(element)
    adaptElementBorders(element)
  })
}

function adaptElementBackground(element: HTMLElement, force: boolean) {
  const backgroundColor =
    normalizeCssColor(element.getAttribute("bgcolor")) ??
    normalizeCssColor(element.style.backgroundColor)

  if (!backgroundColor) {
    return
  }

  const rgb = parseCssColorRgb(backgroundColor)

  if (!rgb || !shouldDarkenBackgroundColor(rgb, force)) {
    return
  }

  element.removeAttribute("bgcolor")
  element.style.setProperty("background-color", "transparent", "important")
}

function adaptElementTextColor(element: HTMLElement) {
  const color = normalizeCssColor(element.style.color)

  if (!color) {
    return
  }

  const rgb = parseCssColorRgb(color)

  if (!rgb || getLuminance(rgb) >= 0.58) {
    return
  }

  const nextColor =
    getSaturation(rgb) > 0.35 ? lightenColor(rgb, 0.58) : darkTextColor

  element.style.setProperty("color", nextColor, "important")
}

function adaptElementBorders(element: HTMLElement) {
  const borderProperties = [
    "borderColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
  ] as const

  for (const property of borderProperties) {
    const color = normalizeCssColor(element.style[property])

    if (!color) {
      continue
    }

    const rgb = parseCssColorRgb(color)

    if (rgb && getLuminance(rgb) > 0.55) {
      element.style.setProperty(
        cssPropertyName(property),
        darkBorderColor,
        "important"
      )
    }
  }
}

function shouldDarkenBackgroundColor(rgb: RgbColor, force: boolean) {
  if (getLuminance(rgb) < 0.55) {
    return false
  }

  return force || getSaturation(rgb) < 0.4
}

function getEmailBackgroundColor(document: Document) {
  const candidates = getEmailBackgroundCandidates(document)

  for (const element of candidates) {
    const backgroundColor =
      normalizeCssColor(element.getAttribute("bgcolor")) ??
      normalizeCssColor(element.style.backgroundColor) ??
      normalizeCssColor(element.style.background)

    if (backgroundColor) {
      return backgroundColor
    }
  }

  return null
}

function getEmailBackgroundCandidates(document: Document) {
  const candidates: HTMLElement[] = []

  if (document.documentElement instanceof HTMLElement) {
    candidates.push(document.documentElement)
  }

  if (document.body) {
    candidates.push(document.body)

    let element = document.body.firstElementChild

    while (element instanceof HTMLElement && candidates.length < 10) {
      candidates.push(element)
      element = element.firstElementChild
    }
  }

  return candidates
}

function sanitizeEmailDocument(document: Document) {
  const blockedSelectors = [
    "script",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "meta[http-equiv]",
  ]

  document
    .querySelectorAll(blockedSelectors.join(","))
    .forEach((element) => element.remove())

  document.querySelectorAll("*").forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()

      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name)
        continue
      }

      if (name === "srcset") {
        element.removeAttribute(attribute.name)
        continue
      }

      if (
        [
          "href",
          "src",
          "xlink:href",
          "background",
          "action",
          "formaction",
        ].includes(name) &&
        !isSafeEmailUrl(name, value)
      ) {
        element.removeAttribute(attribute.name)
        continue
      }

      if (name === "style") {
        element.setAttribute(attribute.name, sanitizeInlineStyle(value))
      }
    }

    if (element instanceof HTMLAnchorElement) {
      element.target = "_blank"
      element.rel = "noreferrer"
    }

    if (element instanceof HTMLImageElement) {
      element.loading = "eager"
      element.decoding = "async"
      element.referrerPolicy = "no-referrer"
    }
  })
}

function darkEmailCss() {
  return `
      .email-root :where(table, tbody, thead, tfoot, tr, td, th, div, p, section, article, header, footer, main, center) {
        background-color: transparent !important;
      }
      .email-root :where(p, div, span, td, th, li, h1, h2, h3, h4, h5, h6, strong, em, b, i) {
        color: ${darkTextColor} !important;
      }
      .email-root :where(small, sub, sup) {
        color: #b6c0ca !important;
      }
      .email-root :where(hr) {
        border-color: ${darkBorderColor} !important;
      }
      .email-root :where(code, pre) {
        background: #0f1215 !important;
        color: #edf2f7 !important;
      }
      .email-root img,
      .email-root picture,
      .email-root video {
        background: transparent !important;
      }
    `
}

function normalizeCssColor(value: string | null) {
  const color = value?.trim()

  if (
    !color ||
    color.toLowerCase() === "transparent" ||
    color.toLowerCase() === "inherit" ||
    color.toLowerCase() === "initial" ||
    color.toLowerCase() === "unset"
  ) {
    return null
  }

  if (typeof CSS !== "undefined" && CSS.supports("color", color)) {
    return color
  }

  if (
    /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ||
    /^rgba?\(/i.test(color) ||
    /^hsla?\(/i.test(color)
  ) {
    return color
  }

  return null
}

function getReadableTextColor(backgroundColor: string) {
  return isDarkCssColor(backgroundColor) ? darkTextColor : "#20252a"
}

function isDarkCssColor(color: string) {
  const rgb = parseCssColorRgb(color)

  if (!rgb) {
    return false
  }

  return getLuminance(rgb) < 0.48
}

function parseCssColorRgb(color: string): RgbColor | null {
  const normalizedColor = namedColors[color.toLowerCase()] ?? color
  const hexMatch = normalizedColor.match(
    /^#(?<value>[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
  )

  if (hexMatch?.groups?.value) {
    const value = hexMatch.groups.value
    const channels =
      value.length <= 4
        ? value
            .slice(0, 3)
            .split("")
            .map((part) => Number.parseInt(`${part}${part}`, 16))
        : [
            Number.parseInt(value.slice(0, 2), 16),
            Number.parseInt(value.slice(2, 4), 16),
            Number.parseInt(value.slice(4, 6), 16),
          ]

    return {
      r: channels[0] ?? 0,
      g: channels[1] ?? 0,
      b: channels[2] ?? 0,
    }
  }

  const rgbMatch = normalizedColor.match(
    /^rgba?\(\s*(?<r>\d+(?:\.\d+)?)\s*,\s*(?<g>\d+(?:\.\d+)?)\s*,\s*(?<b>\d+(?:\.\d+)?)/i
  )

  if (!rgbMatch?.groups) {
    return null
  }

  return {
    r: clamp(Number(rgbMatch.groups.r), 0, 255),
    g: clamp(Number(rgbMatch.groups.g), 0, 255),
    b: clamp(Number(rgbMatch.groups.b), 0, 255),
  }
}

function getLuminance(color: RgbColor) {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255
}

function getSaturation(color: RgbColor) {
  const max = Math.max(color.r, color.g, color.b) / 255
  const min = Math.min(color.r, color.g, color.b) / 255

  if (max === 0) {
    return 0
  }

  return (max - min) / max
}

function lightenColor(color: RgbColor, amount: number) {
  return rgbToHex({
    r: color.r + (255 - color.r) * amount,
    g: color.g + (255 - color.g) * amount,
    b: color.b + (255 - color.b) * amount,
  })
}

function rgbToHex(color: RgbColor) {
  return `#${[color.r, color.g, color.b]
    .map((channel) =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

function cssPropertyName(property: string) {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function isSafeEmailUrl(attributeName: string, value: string) {
  if (
    !value ||
    value.startsWith("#") ||
    value.toLowerCase().startsWith("cid:")
  ) {
    return true
  }

  if (value.toLowerCase().startsWith("data:")) {
    return (
      attributeName !== "href" &&
      /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(value)
    )
  }

  try {
    const url = new URL(value, window.location.href)

    if (attributeName === "href" || attributeName === "xlink:href") {
      return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol)
    }

    return ["http:", "https:"].includes(url.protocol)
  } catch {
    return false
  }
}

function sanitizeInlineStyle(value: string) {
  return value
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/url\s*\(\s*(['"]?)\s*javascript:[^)]+\)/gi, "url($1)")
}

function hashText(value: string) {
  let hash = 0

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index)
    hash |= 0
  }

  return hash.toString(36)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

const namedColors: Record<string, string> = {
  black: "#000000",
  blue: "#0000ff",
  gray: "#808080",
  green: "#008000",
  grey: "#808080",
  red: "#ff0000",
  silver: "#c0c0c0",
  white: "#ffffff",
  yellow: "#ffff00",
}
