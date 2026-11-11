import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import IconCheck from "@tabler/icons-react/dist/esm/icons/IconCheck.mjs"
import IconExternalLink from "@tabler/icons-react/dist/esm/icons/IconExternalLink.mjs"
import IconEye from "@tabler/icons-react/dist/esm/icons/IconEye.mjs"
import IconEyeOff from "@tabler/icons-react/dist/esm/icons/IconEyeOff.mjs"
import IconFolderX from "@tabler/icons-react/dist/esm/icons/IconFolderX.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconPaperclip from "@tabler/icons-react/dist/esm/icons/IconPaperclip.mjs"
import IconPinned from "@tabler/icons-react/dist/esm/icons/IconPinned.mjs"
import IconPinnedOff from "@tabler/icons-react/dist/esm/icons/IconPinnedOff.mjs"
import IconRefresh from "@tabler/icons-react/dist/esm/icons/IconRefresh.mjs"
import IconTrash from "@tabler/icons-react/dist/esm/icons/IconTrash.mjs"
import IconX from "@tabler/icons-react/dist/esm/icons/IconX.mjs"
import { Button } from "@workspace/ui/components/button"
import { Tooltip } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import {
  compactNumber,
  formatAddress,
  formatDate,
  formatDateTime,
} from "@/features/mail/utils/mail-format"
import type { MessageListItemDto } from "@/lib/api-client"

const mobileMessageSelectionLongPressMs = 520
const mobileMessageSelectionMoveTolerancePx = 12

export const ServiceWorkerUpdateListRow = React.memo(
  function ServiceWorkerUpdateListRow({
    height,
    loading,
    start,
    onDismiss,
    onRefresh,
  }: {
    height: number
    loading: boolean
    start: number
    onDismiss: () => void
    onRefresh: () => void
  }) {
    const { t } = useMailLocale()

    return (
      <article
        aria-live="polite"
        className="absolute top-0 left-0 w-full border-b border-l-[3px] border-[#d8dee5] border-l-[#1f8a70] bg-[#f3faf7] text-[#20252a] dark:border-b-[#30353a] dark:border-l-[#7ed8bf] dark:bg-[#14231d] dark:text-[#eef2f4]"
        role="status"
        style={{
          height,
          transform: `translateY(${start}px)`,
        }}
      >
        <div className="grid h-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#dcefe8] text-[#176d59] dark:bg-[#1f3a30] dark:text-[#8de1c2]">
            {loading ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconRefresh className="size-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {t(
                "Email Host · Новая версия готова",
                "Email Host · New version ready"
              )}
            </span>
            <span className="mt-0.5 block truncate text-sm text-[#4c5b55] dark:text-[#b9c9c2]">
              {loading
                ? t(
                    "Перезапускаю приложение с новой версией…",
                    "Restarting with the new version…"
                  )
                : t(
                    "Нажми, чтобы установить и перезапустить приложение",
                    "Click to install and restart the app"
                  )}
            </span>
            <span className="mt-0.5 block text-xs text-[#7a8882] dark:text-[#8fa29a]">
              {t("Обновление Email Host", "Email Host update")}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <Button
              aria-label={
                loading
                  ? t("Обновляю приложение", "Updating app")
                  : t("Обновить приложение", "Update app")
              }
              className="size-8 p-0"
              disabled={loading}
              size="icon-sm"
              type="button"
              onClick={onRefresh}
            >
              {loading ? (
                <IconLoader2 className="size-3.5 animate-spin" />
              ) : (
                <IconRefresh className="size-3.5" />
              )}
            </Button>
            <Button
              aria-label={t(
                "Скрыть уведомление об обновлении",
                "Dismiss update notification"
              )}
              className="size-8 p-0"
              disabled={loading}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={onDismiss}
            >
              <IconX className="size-4" />
            </Button>
          </span>
        </div>
      </article>
    )
  }
)

export const MessageListLoadingRow = React.memo(function MessageListLoadingRow({
  height,
  loading,
  start,
}: {
  height: number
  loading: boolean
  start: number
}) {
  return (
    <div
      className="absolute top-0 left-0 grid w-full place-items-center py-4 text-sm text-[#68727d] dark:text-[#a7b0ba]"
      style={{
        height,
        transform: `translateY(${start}px)`,
      }}
    >
      {loading ? <IconLoader2 className="size-4 animate-spin" /> : null}
    </div>
  )
})

export function MessageContextMenu({
  message,
  x,
  y,
  onClose,
  onMoveToSpecial,
  onOpen,
  onToggleFlagged,
  onToggleSeen,
  onToggleSelection,
}: {
  message: MessageListItemDto
  x: number
  y: number
  onClose: () => void
  onMoveToSpecial: (message: MessageListItemDto, specialUse: string) => void
  onOpen: (message: MessageListItemDto) => void
  onToggleFlagged: (message: MessageListItemDto) => void
  onToggleSeen: (message: MessageListItemDto) => void
  onToggleSelection: (message: MessageListItemDto) => void
}) {
  const { t } = useMailLocale()

  function run(action: () => void) {
    action()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        className="fixed z-50 w-[240px] rounded-md border border-[#d8dee5] bg-white p-1 text-sm text-[#20252a] shadow-[0_18px_50px_rgba(15,23,42,0.22)] dark:border-[#30353a] dark:bg-[#181b1f] dark:text-[#eef2f4]"
        role="menu"
        style={{ left: x, top: y }}
        onContextMenu={(event) => event.preventDefault()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <MessageContextMenuButton
          icon={<IconExternalLink className="size-4" />}
          label={t("Открыть", "Open")}
          onClick={() => run(() => onOpen(message))}
        />
        <MessageContextMenuButton
          icon={<IconCheck className="size-4" />}
          label={t("Выбрать", "Select")}
          onClick={() => run(() => onToggleSelection(message))}
        />
        <div className="my-1 h-px bg-[#e2e7eb] dark:bg-[#2b3035]" />
        <MessageContextMenuButton
          icon={
            message.seen ? (
              <IconEyeOff className="size-4" />
            ) : (
              <IconEye className="size-4" />
            )
          }
          label={
            message.seen
              ? t("Сделать непрочитанным", "Mark as unread")
              : t("Прочитать", "Mark as read")
          }
          onClick={() => run(() => onToggleSeen(message))}
        />
        <MessageContextMenuButton
          icon={
            message.flagged ? (
              <IconPinnedOff className="size-4" />
            ) : (
              <IconPinned className="size-4" />
            )
          }
          label={
            message.flagged
              ? t("Снять закрепление", "Unpin")
              : t("Закрепить", "Pin")
          }
          onClick={() => run(() => onToggleFlagged(message))}
        />
        <div className="my-1 h-px bg-[#e2e7eb] dark:bg-[#2b3035]" />
        <MessageContextMenuButton
          destructive
          icon={<IconTrash className="size-4" />}
          label={t("Удалить", "Delete")}
          onClick={() => run(() => onMoveToSpecial(message, "\\Trash"))}
        />
        <MessageContextMenuButton
          icon={<IconFolderX className="size-4" />}
          label={t("В спам", "Move to spam")}
          onClick={() => run(() => onMoveToSpecial(message, "\\Junk"))}
        />
      </div>
    </div>
  )
}

function MessageContextMenuButton({
  destructive,
  icon,
  label,
  onClick,
}: {
  destructive?: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded px-2 text-left transition outline-none hover:bg-[#edf2f5] focus-visible:bg-[#edf2f5] dark:hover:bg-[#242a30] dark:focus-visible:bg-[#242a30]",
        destructive
          ? "text-[#b42318] dark:text-[#ffb3a7]"
          : "text-[#20252a] dark:text-[#eef2f4]"
      )}
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}

export const MessageListItemRow = React.memo(function MessageListItemRow({
  accountLabel,
  height,
  isActive,
  isChecked,
  message,
  start,
  onClick,
  onContextMenu,
  onToggleFlagged,
  onToggleSelection,
}: {
  accountLabel: string
  height: number
  isActive: boolean
  isChecked: boolean
  message: MessageListItemDto
  start: number
  onClick: (
    message: MessageListItemDto,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void
  onContextMenu: (
    message: MessageListItemDto,
    event: React.MouseEvent<HTMLButtonElement>
  ) => void
  onToggleFlagged: (message: MessageListItemDto) => void | Promise<void>
  onToggleSelection: (message: MessageListItemDto) => void
}) {
  const { t } = useMailLocale()

  const isHighlighted = isActive || isChecked
  const pinButtonLabel = message.flagged
    ? t("Открепить письмо", "Unpin message")
    : t("Закрепить письмо", "Pin message")
  const longPressTimeoutRef = React.useRef<number | null>(null)
  const longPressStartRef = React.useRef<{
    x: number
    y: number
  } | null>(null)
  const suppressNextClickRef = React.useRef(false)
  const clearLongPressTimeout = React.useCallback(() => {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current)
      longPressTimeoutRef.current = null
    }

    longPressStartRef.current = null
  }, [])

  React.useEffect(() => clearLongPressTimeout, [clearLongPressTimeout])

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "touch") {
      return
    }

    clearLongPressTimeout()
    longPressStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    }
    longPressTimeoutRef.current = window.setTimeout(() => {
      longPressTimeoutRef.current = null
      longPressStartRef.current = null
      suppressNextClickRef.current = true
      onToggleSelection(message)
    }, mobileMessageSelectionLongPressMs)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const start = longPressStartRef.current

    if (!start) {
      return
    }

    const deltaX = Math.abs(event.clientX - start.x)
    const deltaY = Math.abs(event.clientY - start.y)

    if (
      deltaX > mobileMessageSelectionMoveTolerancePx ||
      deltaY > mobileMessageSelectionMoveTolerancePx
    ) {
      clearLongPressTimeout()
    }
  }

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      event.preventDefault()
      return
    }

    onClick(message, event)
  }

  function handleContextMenu(event: React.MouseEvent<HTMLButtonElement>) {
    clearLongPressTimeout()
    onContextMenu(message, event)
  }

  return (
    <div
      className="absolute top-0 left-0 w-full"
      style={{
        height,
        transform: `translateY(${start}px)`,
      }}
    >
      <div className="relative h-full">
        <button
          aria-selected={isActive}
          className={cn(
            "focus-visible:ring-mail-accent relative flex h-full w-full min-w-0 flex-col overflow-hidden border-b px-3 py-3 text-left transition focus-visible:ring-2 focus-visible:outline-none",
            message.seen
              ? "border-[#e0e6eb] bg-white hover:bg-[#fbfcfd] dark:border-[#2b3035] dark:bg-[#171b1f] dark:hover:bg-[#1b2025]"
              : "border-mail-accent bg-mail-accent-soft hover:bg-mail-accent-soft",
            isHighlighted && "border-b-mail-border bg-mail-accent-soft",
            isActive && "bg-mail-accent-soft"
          )}
          type="button"
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          onPointerCancel={clearLongPressTimeout}
          onPointerDown={handlePointerDown}
          onPointerLeave={clearLongPressTimeout}
          onPointerMove={handlePointerMove}
          onPointerUp={clearLongPressTimeout}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-0 bottom-0 left-0 w-1 transition-colors",
              isHighlighted ? "bg-mail-accent" : "bg-transparent"
            )}
          />

          <div className="mb-1 w-full max-w-full min-w-0 pr-9">
            <p
              className={cn(
                "block w-full max-w-full min-w-0 truncate text-[14px] leading-5",
                message.seen
                  ? "font-semibold text-[#252b31] dark:text-[#eef2f4]"
                  : "font-extrabold text-[#11171d] dark:text-white"
              )}
            >
              {formatAddress(message.from)}
            </p>
          </div>

          <div className="flex w-full max-w-full min-w-0 items-center gap-2">
            <p
              className={cn(
                "max-w-full min-w-0 flex-1 truncate text-[13px] leading-5",
                message.seen
                  ? "font-medium text-[#3b444d] dark:text-[#c8d0d8]"
                  : "font-bold text-[#20252a] dark:text-[#eef2f4]"
              )}
            >
              {message.subject ?? t("Без темы", "No subject")}
            </p>
            {message.hasAttachments ? (
              <IconPaperclip className="size-4 shrink-0 text-[#7a838c]" />
            ) : null}
          </div>

          <div className="mt-auto grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 pt-2 text-[12px] leading-none text-[#7a838c] dark:text-[#8d98a3]">
            <span className="min-w-0 truncate">{accountLabel}</span>
            <TrackingStatus
              clickTracking={message.clickTracking}
              openTracking={message.openTracking}
            />
            <time className="col-start-3 shrink-0 justify-self-end text-xs font-medium text-[#7a838c] dark:text-[#9ca6af]">
              {formatDate(message.sentAt)}
            </time>
          </div>
        </button>
        <Tooltip content={pinButtonLabel}>
          <Button
            aria-label={pinButtonLabel}
            aria-pressed={message.flagged}
            className={cn(
              "absolute top-2.5 right-3 z-10 size-7 rounded-full text-[#7a838c] hover:bg-white/85 hover:text-[#20252a] dark:text-[#9ca6af] dark:hover:bg-[#242a30] dark:hover:text-[#eef2f4]",
              message.flagged &&
                "bg-[#fff6df] text-[#d99a19] hover:bg-[#ffefd1] hover:text-[#9f6400] dark:bg-[#3a2a12] dark:text-[#f0b84a] dark:hover:bg-[#463317]"
            )}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => void onToggleFlagged(message)}
          >
            <IconPinned className="size-4" />
          </Button>
        </Tooltip>
      </div>
    </div>
  )
})

export function TrackingStatus({
  clickTracking,
  openTracking,
}: {
  clickTracking: MessageListItemDto["clickTracking"]
  openTracking: MessageListItemDto["openTracking"]
}) {
  const { t } = useMailLocale()

  if (!openTracking?.enabled && !clickTracking?.enabled) {
    return null
  }

  const opened = Boolean(openTracking?.enabled && openTracking.openCount > 0)
  const clicked = Boolean(
    clickTracking?.enabled && clickTracking.clickCount > 0
  )
  const openLabel = openTracking?.enabled
    ? opened
      ? t(
          `Открыто: ${compactNumber(openTracking.openCount)}`,
          `Opened: ${compactNumber(openTracking.openCount)}`
        )
      : t("Пока не открыто", "Not opened yet")
    : null
  const clickLabel = clickTracking?.enabled
    ? clicked
      ? t(
          `Клики: ${compactNumber(clickTracking.clickCount)}`,
          `Clicks: ${compactNumber(clickTracking.clickCount)}`
        )
      : t("Кликов пока нет", "No clicks yet")
    : null
  const tooltip = [
    openLabel &&
      (opened && openTracking?.lastOpenedAt
        ? t(
            `${openLabel}, последнее: ${formatDateTime(openTracking.lastOpenedAt)}`,
            `${openLabel}, last opened: ${formatDateTime(openTracking.lastOpenedAt)}`
          )
        : openLabel),
    clickLabel &&
      (clicked && clickTracking?.lastClickedAt
        ? t(
            `${clickLabel}, последний: ${formatDateTime(clickTracking.lastClickedAt)}`,
            `${clickLabel}, last clicked: ${formatDateTime(clickTracking.lastClickedAt)}`
          )
        : clickLabel),
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <Tooltip content={tooltip}>
      <span
        aria-label={tooltip}
        className="inline-flex max-w-[12rem] shrink-0 items-center gap-1.5 truncate font-semibold"
      >
        {openTracking?.enabled ? (
          <span
            className={cn(
              "inline-flex min-w-0 items-center gap-1",
              opened
                ? "text-[#1f8a70] dark:text-[#48c5a2]"
                : "text-[#8a949e] dark:text-[#7f8b96]"
            )}
          >
            {opened ? (
              <IconEye className="size-3.5 shrink-0" />
            ) : (
              <IconEyeOff className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {opened
                ? t(
                    `Открыто ${compactNumber(openTracking.openCount)}`,
                    `Opened ${compactNumber(openTracking.openCount)}`
                  )
                : t("Не открыто", "Not opened")}
            </span>
          </span>
        ) : null}
        {clickTracking?.enabled ? (
          <span
            className={cn(
              "inline-flex min-w-0 items-center gap-1",
              clicked
                ? "text-[#1f8a70] dark:text-[#48c5a2]"
                : "text-[#8a949e] dark:text-[#7f8b96]"
            )}
          >
            <IconExternalLink className="size-3.5 shrink-0" />
            <span className="truncate">
              {clicked
                ? t(
                    `Клики ${compactNumber(clickTracking.clickCount)}`,
                    `Clicks ${compactNumber(clickTracking.clickCount)}`
                  )
                : t("Кликов нет", "No clicks")}
            </span>
          </span>
        ) : null}
      </span>
    </Tooltip>
  )
}
