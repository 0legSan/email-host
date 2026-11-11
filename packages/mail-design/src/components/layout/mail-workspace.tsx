import { useMailLocale } from "../../i18n/use-mail-locale"
import type { CSSProperties, ReactNode } from "react"

type MailWorkspaceProps = {
  children: ReactNode
  columns?: string
  hidden?: boolean
  mobileNavigationOpen?: boolean
  onCloseMobileNavigation?: () => void
}

export function MailWorkspace({
  children,
  columns,
  hidden = false,
  mobileNavigationOpen = false,
  onCloseMobileNavigation,
}: MailWorkspaceProps) {
  const { t } = useMailLocale()

  const style = columns
    ? ({ "--mail-layout-cols": columns } as CSSProperties)
    : undefined

  return (
    <main
      hidden={hidden}
      className="bg-mail-canvas text-mail-text min-h-svh lg:h-svh lg:overflow-hidden"
    >
      <div
        className="grid min-h-svh grid-cols-1 lg:h-svh lg:[grid-template-columns:var(--mail-layout-cols)]"
        style={style}
      >
        {mobileNavigationOpen ? (
          <button
            aria-label={t("Закрыть меню", "Close menu")}
            className="fixed inset-0 z-40 bg-black/35 lg:hidden"
            type="button"
            onClick={onCloseMobileNavigation}
          />
        ) : null}
        {children}
      </div>
    </main>
  )
}
