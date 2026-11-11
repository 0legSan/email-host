/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { applyMailAccent } from "./appearance-bootstrap"
import {
  parseMailAccent,
  readAppearanceValue,
  saveAppearanceValue,
  type MailAccent,
} from "./appearance-storage"
export type { MailAccent } from "./appearance-storage"

export type MailTheme = "dark" | "light" | "system"
export type ResolvedMailTheme = "dark" | "light"

type MailThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: MailTheme
  storageKey?: string
  disableTransitionOnChange?: boolean
}

type MailThemeProviderState = {
  theme: MailTheme
  resolvedTheme: ResolvedMailTheme
  setTheme: (theme: MailTheme) => void
  accent: MailAccent
  setAccent: (accent: MailAccent) => void
  appearanceSaved: boolean
}

const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)"
const THEME_VALUES: MailTheme[] = ["dark", "light", "system"]
const THEME_COLORS: Record<ResolvedMailTheme, string> = {
  light: "#f7f9fb",
  dark: "#101214",
}
const APPLE_STATUS_BAR_STYLES: Record<ResolvedMailTheme, string> = {
  light: "default",
  dark: "black",
}

const MailThemeContext = React.createContext<
  MailThemeProviderState | undefined
>(undefined)

function isTheme(value: string | null): value is MailTheme {
  return value !== null && THEME_VALUES.includes(value as MailTheme)
}

function getSystemTheme(): ResolvedMailTheme {
  return window.matchMedia(COLOR_SCHEME_QUERY).matches ? "dark" : "light"
}

function applyThemeMetadata(resolvedTheme: ResolvedMailTheme) {
  const themeColorMeta = document.querySelector<HTMLMetaElement>(
    "meta[name='theme-color']"
  )
  const appleStatusBarMeta = document.querySelector<HTMLMetaElement>(
    "meta[name='apple-mobile-web-app-status-bar-style']"
  )

  document.documentElement.style.colorScheme = resolvedTheme
  themeColorMeta?.setAttribute("content", THEME_COLORS[resolvedTheme])
  appleStatusBarMeta?.setAttribute(
    "content",
    APPLE_STATUS_BAR_STYLES[resolvedTheme]
  )
}

function disableTransitionsTemporarily() {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;transition:none!important}"
    )
  )
  document.head.appendChild(style)

  return () => {
    window.getComputedStyle(document.body)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => style.remove())
    })
  }
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']")
  )
}

export function MailThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "theme",
  disableTransitionOnChange = true,
}: MailThemeProviderProps) {
  const [theme, setThemeState] = React.useState<MailTheme>(() => {
    const storedTheme = readAppearanceValue(storageKey)
    return isTheme(storedTheme) ? storedTheme : defaultTheme
  })
  const [accent, setAccentState] = React.useState<MailAccent>(() =>
    parseMailAccent(readAppearanceValue("mail-accent"))
  )
  const [themeSaved, setThemeSaved] = React.useState(true)
  const [accentSaved, setAccentSaved] = React.useState(true)
  const appearanceSaved = themeSaved && accentSaved
  const setAccent = React.useCallback((nextAccent: MailAccent) => {
    const validAccent = parseMailAccent(nextAccent)
    setAccentState(validAccent)
    setAccentSaved(saveAppearanceValue("mail-accent", validAccent))
  }, [])
  const [systemTheme, setSystemTheme] =
    React.useState<ResolvedMailTheme>(getSystemTheme)
  const resolvedTheme = theme === "system" ? systemTheme : theme
  React.useEffect(() => {
    applyMailAccent(document.documentElement, accent, resolvedTheme === "dark")
  }, [accent, resolvedTheme])

  const setTheme = React.useCallback(
    (nextTheme: MailTheme) => {
      if (nextTheme === "system") {
        setSystemTheme(getSystemTheme())
      }
      setThemeSaved(saveAppearanceValue(storageKey, nextTheme))
      setThemeState(nextTheme)
    },
    [storageKey]
  )

  const applyTheme = React.useCallback(
    (nextResolvedTheme: ResolvedMailTheme) => {
      const restoreTransitions = disableTransitionOnChange
        ? disableTransitionsTemporarily()
        : null

      document.documentElement.classList.remove("light", "dark")
      document.documentElement.classList.add(nextResolvedTheme)
      applyThemeMetadata(nextResolvedTheme)
      restoreTransitions?.()
    },
    [disableTransitionOnChange]
  )

  React.useEffect(() => {
    applyTheme(resolvedTheme)
  }, [resolvedTheme, applyTheme])

  React.useEffect(() => {
    if (theme !== "system") {
      return undefined
    }

    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY)
    const handleChange = () => setSystemTheme(getSystemTheme())
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target) ||
        event.key.toLowerCase() !== "d"
      ) {
        return
      }

      setTheme(
        theme === "dark"
          ? "light"
          : theme === "light"
            ? "system"
            : getSystemTheme() === "dark"
              ? "light"
              : "dark"
      )
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [theme, setTheme])

  React.useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      try {
        if (event.storageArea !== window.localStorage) return
      } catch {
        return
      }
      if (event.key === "mail-accent" || event.key === null) {
        setAccentState(
          parseMailAccent(event.key === null ? null : event.newValue)
        )
      }
      if (event.key !== storageKey && event.key !== null) {
        return
      }
      setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme)
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [defaultTheme, storageKey])

  const value = React.useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      accent,
      setAccent,
      appearanceSaved,
    }),
    [theme, resolvedTheme, setTheme, accent, setAccent, appearanceSaved]
  )

  return (
    <MailThemeContext.Provider value={value}>
      {children}
    </MailThemeContext.Provider>
  )
}

export function useMailTheme() {
  const context = React.useContext(MailThemeContext)
  if (!context) {
    throw new Error("useMailTheme must be used within a MailThemeProvider")
  }
  return context
}
