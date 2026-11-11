import { localizeRequestErrorText } from "@/lib/request-error-text"
import { mailText } from "@workspace/mail-design/locale"

// Keep both variants in transient state so an already visible message changes language.
export type UiMessage = string | readonly [ru: string, en: string]

export function formatUiMessage(message: UiMessage | null) {
  return typeof message === "string"
    ? localizeRequestErrorText(message)
    : message
      ? mailText(message[0], message[1])
      : ""
}

export class UiMessageError extends Error {
  readonly variants: readonly [string, string]

  constructor(ru: string, en: string) {
    super(mailText(ru, en))
    this.variants = [ru, en]
  }
}
