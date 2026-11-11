import { customAccentRoles, normalizeHexColor } from "./accent-colors"
import {
  parseMailAccent,
  readAppearanceValue,
  type MailAccent,
} from "./appearance-storage"

export function applyMailAccent(
  root: HTMLElement,
  accent: MailAccent,
  dark: boolean
) {
  root.dataset.mailAccent = accent
  const custom = normalizeHexColor(accent)
  const roles = custom ? customAccentRoles(custom, dark) : null
  for (const role of ["accent", "foreground", "soft", "text"] as const) {
    const property =
      role === "accent" ? "--mail-accent" : `--mail-accent-${role}`
    if (roles) root.style.setProperty(property, roles[role])
    else root.style.removeProperty(property)
  }
}

export function bootstrapMailAppearance() {
  const root = document.documentElement
  const stored = readAppearanceValue("theme")
  const theme =
    stored === "dark" || stored === "light"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
  root.classList.remove("dark", "light")
  root.classList.add(theme)
  root.style.colorScheme = theme
  applyMailAccent(
    root,
    parseMailAccent(readAppearanceValue("mail-accent")),
    theme === "dark"
  )
  document
    .querySelector("meta[name='theme-color']")
    ?.setAttribute("content", theme === "dark" ? "#101214" : "#f7f9fb")
  document
    .querySelector("meta[name='apple-mobile-web-app-status-bar-style']")
    ?.setAttribute("content", theme === "dark" ? "black" : "default")
}
