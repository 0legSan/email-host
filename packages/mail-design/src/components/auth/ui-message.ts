import { mailText } from "../../locale"

// Keep both variants in transient state so an already visible message changes language.
export type UiMessage = string | readonly [ru: string, en: string]

export function formatUiMessage(message: UiMessage | null) {
  return typeof message === "string"
    ? message
    : message
      ? mailText(message[0], message[1])
      : ""
}
