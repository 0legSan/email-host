import { createContext, useContext } from "react"

export type UiLocale = "ru" | "en"
export const UiLocaleContext = createContext<UiLocale>("ru")

export function useUiLocale() {
  return useContext(UiLocaleContext)
}
