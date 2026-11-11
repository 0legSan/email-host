import { normalizeHexColor, type HexColor } from "./accent-colors"

export const MAIL_ACCENTS = [
  "green",
  "blue",
  "violet",
  "orange",
  "rose",
  "graphite",
] as const
export type MailAccentPreset = (typeof MAIL_ACCENTS)[number]
export type MailAccent = MailAccentPreset | HexColor

export function parseMailAccent(value: unknown): MailAccent {
  return (
    normalizeHexColor(value) ??
    MAIL_ACCENTS.find((accent) => accent === value) ??
    "green"
  )
}

export function readAppearanceValue(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function saveAppearanceValue(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
