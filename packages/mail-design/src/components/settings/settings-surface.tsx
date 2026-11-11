import type { ReactNode } from "react"

export function MailSettingsSurface({
  children,
  titleId,
}: {
  children: ReactNode
  titleId: string
}) {
  return (
    <main
      data-mail-settings-page
      aria-labelledby={titleId}
      className="bg-mail-canvas text-mail-text relative flex h-svh min-h-0 min-w-0 flex-col overflow-hidden"
    >
      {children}
    </main>
  )
}
