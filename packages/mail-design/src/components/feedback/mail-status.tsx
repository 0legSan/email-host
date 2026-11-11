import { useMailLocale } from "../../i18n/use-mail-locale"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import type { ReactNode } from "react"

export function MailSessionChecking() {
  const { t } = useMailLocale()

  return (
    <main className="bg-mail-canvas text-mail-text grid min-h-svh place-items-center">
      <div className="text-mail-text-muted flex items-center gap-3 text-sm">
        <IconLoader2 className="size-5 animate-spin" />
        {t("Проверяю сессию", "Checking session")}
      </div>
    </main>
  )
}

export function MailPaneState({
  children,
  icon,
}: {
  children: ReactNode
  icon: ReactNode
}) {
  return (
    <div className="text-mail-text-muted grid h-full min-h-52 place-items-center px-6 text-center text-sm">
      <div className="grid justify-items-center gap-3">
        {icon}
        <p>{children}</p>
      </div>
    </div>
  )
}
