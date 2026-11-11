import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useMailLocale } from "@workspace/mail-design"
import { localizeDemoStore } from "./localize-store"
import { demoStore, listItem, mailboxes } from "./store"
import { demoUser } from "./data"
import { MailAppView } from "@/features/mail/mail-app-view"
import { useMailController } from "@/features/mail/controller/use-mail-controller"

export function DemoMailApp() {
  const controller = useMailController({ realtimeEnabled: false })
  const { locale } = useMailLocale()
  const queryClient = useQueryClient()
  const {
    setAccounts,
    setProfiles,
    setMailPreferences,
    setMailboxesByAccount,
    setSelectedMessage,
    setMessageThread,
    setUser,
  } = controller
  useEffect(() => {
    if (!localizeDemoStore(locale)) return
    // These controller snapshots are separate from query data. Update the same
    // mock entities without reloading the app or replacing a user's draft.
    setAccounts(structuredClone(demoStore.accounts))
    setProfiles(structuredClone(demoStore.profiles))
    setMailboxesByAccount(
      Object.fromEntries(
        demoStore.accounts.map(({ id }) => [id, mailboxes(id)])
      )
    )
    setUser({ ...demoUser })
    const messages = new Map(
      demoStore.messages.map((message) => [message.id, message])
    )
    // Reader effects load imperative snapshots, so query invalidation alone
    // does not refresh an already open message or its thread.
    setSelectedMessage((current) => {
      const message = current && messages.get(current.id)
      return message ? structuredClone(message) : current
    })
    setMessageThread((current) =>
      current
        ? structuredClone({
            ...current,
            subject: messages.get(current.id)?.subject ?? current.subject,
            messages: current.messages.map((item) => {
              const message = messages.get(item.id)
              return message ? { ...item, ...listItem(message) } : item
            }),
          })
        : current
    )
    void queryClient.invalidateQueries()
  }, [
    locale,
    queryClient,
    setAccounts,
    setProfiles,
    setMailboxesByAccount,
    setSelectedMessage,
    setMessageThread,
    setUser,
  ])
  useEffect(() => {
    // An inserted signature is draft content. Updating it while composing would
    // also replace Plate's active selection and unfinished slash-menu query.
    if (!controller.composeOpen) {
      setMailPreferences(structuredClone(demoStore.preferences))
    }
  }, [locale, controller.composeOpen, setMailPreferences])
  return (
    <MailAppView
      controller={{
        ...controller,
        handleInstallPwa: async () => "unavailable",
        handleRegisterMailtoHandler: () => "unsupported",
        pwaInstallPrompt: null,
      }}
    />
  )
}
