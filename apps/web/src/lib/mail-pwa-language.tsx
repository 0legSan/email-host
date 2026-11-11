import { useEffect } from "react"
import { useMailLocale } from "@workspace/mail-design"
import { putRecord } from "./offline-mail-storage"

export function MailPwaLanguage() {
  const { locale } = useMailLocale()
  useEffect(() => {
    // A closed PWA cannot read localStorage. Its worker uses this existing metadata store.
    void putRecord("metadata", { key: "language", locale }).catch(
      (error: unknown) => {
        console.warn("Could not save the notification language", error)
      }
    )
  }, [locale])
  return null
}
