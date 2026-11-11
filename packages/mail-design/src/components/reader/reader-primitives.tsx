import { useMailLocale } from "../../i18n/use-mail-locale"
import * as React from "react"
import IconChevronDown from "@tabler/icons-react/dist/esm/icons/IconChevronDown.mjs"
import IconChevronRight from "@tabler/icons-react/dist/esm/icons/IconChevronRight.mjs"
import { cn } from "@workspace/ui/lib/utils"

export function MailReaderSurface({
  children,
  open,
}: React.PropsWithChildren<{ open: boolean }>) {
  return (
    <article
      className={cn(
        "bg-mail-panel h-svh min-h-0 flex-col overflow-hidden lg:flex",
        open ? "flex" : "hidden"
      )}
    >
      {children}
    </article>
  )
}

export function MailConversationSurface({
  active,
  children,
}: React.PropsWithChildren<{ active: boolean }>) {
  return (
    <div
      className={
        active ? "mx-auto w-full max-w-5xl px-3 py-4 sm:px-4" : "contents"
      }
    >
      {children}
    </div>
  )
}

export function MailConversationSummary({
  draftLabel,
  historyLabel,
}: {
  draftLabel?: string | null
  historyLabel: string
}) {
  const { t } = useMailLocale()

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-mail-text-strong truncate text-base font-semibold">
          {t("Цепочка переписки", "Conversation")}
        </h3>
        <p className="text-mail-text-muted mt-0.5 text-sm">{historyLabel}</p>
      </div>
      {draftLabel ? (
        <span className="dark:text-mail-warning shrink-0 border border-[#f0c56b] bg-[#fff6dd] px-2.5 py-1 text-xs font-medium text-[#8a5c00] dark:border-[#5b4520] dark:bg-[#2a2111]">
          {draftLabel}
        </span>
      ) : null}
    </div>
  )
}

export function MailConversationList({
  active,
  children,
}: React.PropsWithChildren<{ active: boolean }>) {
  return (
    <div
      className={
        active
          ? "border-mail-border bg-mail-panel flex flex-col overflow-hidden border shadow-sm"
          : "contents"
      }
    >
      {children}
    </div>
  )
}

export const MailConversationRow = React.forwardRef<
  HTMLDivElement,
  {
    address?: string | null
    badges?: React.ReactNode
    current: boolean
    expanded: boolean
    messageId: string
    sender: string
    summary: string
    timeLabel: string
    unread: boolean
    avatar: React.ReactNode
    onToggle: () => void
  }
>(function MailConversationRow(
  {
    address,
    avatar,
    badges,
    current,
    expanded,
    messageId,
    onToggle,
    sender,
    summary,
    timeLabel,
    unread,
  },
  ref
) {
  return (
    <div
      className="border-mail-border-subtle scroll-mt-3 border-b last:border-b-0"
      ref={ref}
    >
      <button
        aria-controls={
          current ? `conversation-message-${messageId}` : undefined
        }
        aria-expanded={expanded}
        className={cn(
          "hover:bg-mail-panel-muted focus-visible:bg-mail-panel-muted grid w-full grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 px-4 text-left transition-colors focus-visible:outline-none",
          expanded ? "py-4" : "py-3",
          unread && !expanded && "bg-[#f7fbff] dark:bg-[#141d27]"
        )}
        type="button"
        onClick={onToggle}
      >
        {avatar}
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="text-mail-text-strong min-w-0 truncate text-sm font-semibold">
              {sender}
            </span>
            {address ? (
              <span className="text-mail-text-subtle hidden max-w-full min-w-0 truncate text-sm sm:inline">
                {address}
              </span>
            ) : null}
            {badges}
          </div>
          <p className="text-mail-text-muted mt-1 truncate text-sm">
            {summary}
          </p>
        </div>
        <div className="text-mail-text-subtle flex min-w-[5.5rem] items-center justify-end gap-2 text-xs">
          <time>{timeLabel}</time>
          {expanded ? (
            <IconChevronDown className="size-4 shrink-0" />
          ) : (
            <IconChevronRight className="size-4 shrink-0" />
          )}
        </div>
      </button>
    </div>
  )
})
