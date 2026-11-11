import type { ReactNode } from "react"
import IconArchive from "@tabler/icons-react/dist/esm/icons/IconArchive.mjs"
import IconFolder from "@tabler/icons-react/dist/esm/icons/IconFolder.mjs"
import IconInbox from "@tabler/icons-react/dist/esm/icons/IconInbox.mjs"
import IconSend from "@tabler/icons-react/dist/esm/icons/IconSend.mjs"
import IconTrash from "@tabler/icons-react/dist/esm/icons/IconTrash.mjs"
import { cn } from "@workspace/ui/lib/utils"

import { EmailHostLogo } from "../brand/email-host-logo"

type MailSidebarFrameProps = {
  children: ReactNode
  mobileOpen: boolean
}

export function MailSidebarFrame({
  children,
  mobileOpen,
}: MailSidebarFrameProps) {
  return (
    <aside
      className={cn(
        "border-mail-border bg-mail-panel-subtle fixed inset-y-0 left-0 z-50 flex min-h-0 w-[min(86vw,340px)] flex-col border-r shadow-[0_24px_80px_rgba(15,23,42,0.22)] transition-transform duration-200 lg:static lg:z-auto lg:w-auto lg:translate-x-0 lg:border-r lg:shadow-none",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      {children}
    </aside>
  )
}

export function MailSidebarHeader({ actions }: { actions: ReactNode }) {
  return (
    <div className="border-mail-border flex h-16 shrink-0 items-center justify-between border-b px-4">
      <div className="flex min-w-0 items-center gap-3">
        <EmailHostLogo className="size-9 shrink-0 rounded-xl" />
        <h1 className="truncate text-sm font-semibold">Email Host</h1>
      </div>
      <div className="flex items-center gap-1">{actions}</div>
    </div>
  )
}

export function MailSidebarSectionLabel({
  action,
  children,
}: {
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <p className="text-mail-text-subtle text-[11px] font-semibold tracking-[0.14em] uppercase">
        {children}
      </p>
      {action}
    </div>
  )
}

type MailSidebarRowProps = {
  active?: boolean
  children: ReactNode
  className?: string
}

export function MailSidebarRow({
  active = false,
  children,
  className,
}: MailSidebarRowProps) {
  return (
    <div
      className={cn(
        "flex h-9 w-full items-center text-sm transition",
        active
          ? "bg-mail-selected text-mail-selected-foreground"
          : "hover:bg-mail-hover text-[#30363d] dark:text-[#d7dde3]",
        className
      )}
    >
      {children}
    </div>
  )
}

export function MailboxIcon({ specialUse }: { specialUse: string | null }) {
  if (specialUse === "\\Inbox") {
    return <IconInbox className="size-4 shrink-0" />
  }

  if (specialUse === "\\Sent") {
    return <IconSend className="size-4 shrink-0" />
  }

  if (specialUse === "\\Trash") {
    return <IconTrash className="size-4 shrink-0" />
  }

  if (specialUse === "\\Junk") {
    return <IconArchive className="size-4 shrink-0" />
  }

  return <IconFolder className="size-4 shrink-0" />
}
