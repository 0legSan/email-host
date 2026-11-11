export const MAIL_LOCALES = ["ru", "en"] as const
export type MailLocale = (typeof MAIL_LOCALES)[number]
export const MAIL_LANGUAGE_KEY = "mail-language"

export function parseMailLocale(value: unknown): MailLocale | null {
  return value === "ru" || value === "en" ? value : null
}

export function resolveMailLocale(
  explicit: unknown,
  stored: unknown
): MailLocale {
  return parseMailLocale(explicit) ?? parseMailLocale(stored) ?? "ru"
}

function initialLocale(): MailLocale {
  if (typeof window === "undefined") return "ru"
  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(MAIL_LANGUAGE_KEY)
  } catch {
    /* Browser storage may be blocked. */
  }
  const explicit = new URLSearchParams(window.location.search).get("lang")
  return resolveMailLocale(explicit, saved)
}

let snapshot = { locale: initialLocale(), saved: true }
const listeners = new Set<() => void>()
export function getMailLocaleSnapshot() {
  return snapshot
}
export function getMailLocale(): MailLocale {
  return snapshot.locale
}
export function getMailIntlLocale(locale = getMailLocale()) {
  return locale === "ru" ? "ru-RU" : "en-US"
}
export function mailText(ru: string, en: string, locale = getMailLocale()) {
  return locale === "ru" ? ru : en
}

function publish(locale: MailLocale, saved: boolean) {
  if (snapshot.locale === locale && snapshot.saved === saved) return
  snapshot = { locale, saved }
  for (const listener of listeners) listener()
}

export function setMailLocale(locale: MailLocale) {
  if (!parseMailLocale(locale)) return
  let saved = false
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(MAIL_LANGUAGE_KEY, locale)
      saved = true
    } catch {
      /* Apply in memory even if persistence is unavailable. */
    }
    // Demo uses memory history. Keep explicit language links consistent after switching.
    if (
      window.location.pathname.startsWith("/demo") ||
      new URLSearchParams(window.location.search).has("lang")
    ) {
      const url = new URL(window.location.href)
      url.searchParams.set("lang", locale)
      window.history.replaceState(window.history.state, "", url)
    }
  }
  publish(locale, saved)
}

function onStorage(event: StorageEvent) {
  if (event.key !== MAIL_LANGUAGE_KEY && event.key !== null) return
  try {
    if (event.storageArea !== window.localStorage) return
  } catch {
    return
  }
  const locale = parseMailLocale(event.newValue) ?? "ru"
  if (
    window.location.pathname.startsWith("/demo") ||
    new URLSearchParams(window.location.search).has("lang")
  ) {
    const url = new URL(window.location.href)
    url.searchParams.set("lang", locale)
    window.history.replaceState(window.history.state, "", url)
  }
  publish(locale, true)
}

export function subscribeMailLocale(listener: () => void) {
  if (listeners.size === 0 && typeof window !== "undefined")
    window.addEventListener("storage", onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && typeof window !== "undefined")
      window.removeEventListener("storage", onStorage)
  }
}
