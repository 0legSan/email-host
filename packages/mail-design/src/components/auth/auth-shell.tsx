import { MailLanguagePicker } from "../../i18n/language-controls"
import type { ReactNode } from "react"

import { EmailHostLogo } from "../brand/email-host-logo"

type AuthShellProps = {
  children: ReactNode
  description: string
  headerAction?: ReactNode
  width?: "default" | "wide"
}

export function AuthShell({
  children,
  description,
  headerAction,
  width = "wide",
}: AuthShellProps) {
  return (
    <main className="bg-mail-canvas text-mail-text grid min-h-svh place-items-center p-4">
      <section
        className={
          width === "default"
            ? "border-mail-border bg-mail-panel w-full max-w-[420px] border p-6 shadow-[0_24px_80px_rgba(23,31,38,0.12)]"
            : "border-mail-border bg-mail-panel w-full max-w-[460px] border p-6 shadow-[0_24px_80px_rgba(23,31,38,0.12)]"
        }
      >
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            <EmailHostLogo className="text-mail-selected h-10 w-auto" />
            <p className="text-mail-text-muted mt-2 text-sm">{description}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-3">
            <MailLanguagePicker compact />
            {headerAction}
          </div>
        </div>
        {children}
      </section>
    </main>
  )
}
