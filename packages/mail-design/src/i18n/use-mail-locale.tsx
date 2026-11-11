import { useCallback, useSyncExternalStore } from "react"
import {
  getMailLocaleSnapshot,
  getMailIntlLocale,
  mailText,
  setMailLocale,
  subscribeMailLocale,
} from "./mail-locale"

export function useMailLocale() {
  const { locale, saved } = useSyncExternalStore(
    subscribeMailLocale,
    getMailLocaleSnapshot,
    getMailLocaleSnapshot
  )
  const t = useCallback(
    (ru: string, en: string) => mailText(ru, en, locale),
    [locale]
  )
  return {
    locale,
    setLocale: setMailLocale,
    localeSaved: saved,
    intlLocale: getMailIntlLocale(locale),
    t,
  }
}
