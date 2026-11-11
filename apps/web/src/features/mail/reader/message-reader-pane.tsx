import { mailText } from "@workspace/mail-design/locale"
import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import IconArrowForwardUp from "@tabler/icons-react/dist/esm/icons/IconArrowForwardUp.mjs"
import IconArrowLeft from "@tabler/icons-react/dist/esm/icons/IconArrowLeft.mjs"
import IconArrowsMaximize from "@tabler/icons-react/dist/esm/icons/IconArrowsMaximize.mjs"
import IconArrowsMinimize from "@tabler/icons-react/dist/esm/icons/IconArrowsMinimize.mjs"
import IconCheck from "@tabler/icons-react/dist/esm/icons/IconCheck.mjs"
import IconCornerUpLeft from "@tabler/icons-react/dist/esm/icons/IconCornerUpLeft.mjs"
import IconDots from "@tabler/icons-react/dist/esm/icons/IconDots.mjs"
import IconDeviceDesktop from "@tabler/icons-react/dist/esm/icons/IconDeviceDesktop.mjs"
import IconEye from "@tabler/icons-react/dist/esm/icons/IconEye.mjs"
import IconEyeOff from "@tabler/icons-react/dist/esm/icons/IconEyeOff.mjs"
import IconFileText from "@tabler/icons-react/dist/esm/icons/IconFileText.mjs"
import IconFolder from "@tabler/icons-react/dist/esm/icons/IconFolder.mjs"
import IconFolderX from "@tabler/icons-react/dist/esm/icons/IconFolderX.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconMail from "@tabler/icons-react/dist/esm/icons/IconMail.mjs"
import IconMoon from "@tabler/icons-react/dist/esm/icons/IconMoon.mjs"
import IconPaperclip from "@tabler/icons-react/dist/esm/icons/IconPaperclip.mjs"
import IconPinned from "@tabler/icons-react/dist/esm/icons/IconPinned.mjs"
import IconPinnedOff from "@tabler/icons-react/dist/esm/icons/IconPinnedOff.mjs"
import IconTrash from "@tabler/icons-react/dist/esm/icons/IconTrash.mjs"
import {
  MailPaneState as PaneState,
  MailReaderSurface,
  MailSenderAvatar,
} from "@workspace/mail-design"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Tooltip } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { TrackingStatus } from "@/features/mail/message-list/message-list-rows"
import { MessageConversation } from "./message-conversation"
import {
  formatAddressList,
  formatAttachmentSize,
  formatDateTime,
  formatSenderName,
} from "@/features/mail/utils/mail-format"
import type {
  AttachmentDto,
  MessageDto,
  MessageListItemDto,
  MessageThreadDto,
} from "@/lib/api-client"
import type { EmailRenderMode } from "@/lib/email-render"

export type MessageWidthMode = "fixed" | "full"

const emailRenderModeOptions: Array<{
  label: string
  mode: EmailRenderMode
  icon: React.ComponentType<{ className?: string }>
  title: string
}> = [
  {
    icon: IconDeviceDesktop,
    get label() {
      return mailText("Авто", "Auto")
    },
    mode: "auto",
    get title() {
      return mailText(
        "Автоматический режим письма",
        "Automatic message appearance"
      )
    },
  },
  {
    icon: IconFileText,
    get label() {
      return mailText("Оригинал", "Original")
    },
    mode: "original",
    get title() {
      return mailText(
        "Оригинальное оформление письма",
        "Original message appearance"
      )
    },
  },
  {
    icon: IconMoon,
    get label() {
      return mailText("Темная", "Dark")
    },
    mode: "dark",
    get title() {
      return mailText("Темная адаптация письма", "Dark message appearance")
    },
  },
]

function EmailRenderModeToggle({
  disabled,
  mode,
  onChange,
}: {
  disabled: boolean
  mode: EmailRenderMode
  onChange: (mode: EmailRenderMode) => void
}) {
  const { t } = useMailLocale()

  const activeIndex = emailRenderModeOptions.findIndex(
    (option) => option.mode === mode
  )
  const activeOption = emailRenderModeOptions[activeIndex]!
  const nextOption =
    emailRenderModeOptions[(activeIndex + 1) % emailRenderModeOptions.length]!
  const ActiveIcon = activeOption.icon

  return (
    <Tooltip
      content={t(
        `Режим письма: ${activeOption.label}`,
        `Message appearance: ${activeOption.label}`
      )}
    >
      <Button
        aria-label={t(
          `Режим письма: ${activeOption.label}. Включить: ${nextOption.label}`,
          `Message appearance: ${activeOption.label}. Switch to: ${nextOption.label}`
        )}
        className={messageToolbarButtonClass}
        disabled={disabled}
        size="sm"
        variant="ghost"
        onClick={() => onChange(nextOption.mode)}
      >
        <ActiveIcon className="size-4" />
        <span className="truncate">{activeOption.label}</span>
      </Button>
    </Tooltip>
  )
}

const messageToolbarButtonClass =
  "h-14 min-w-[76px] shrink-0 flex-col gap-1 rounded-md px-2 text-[11px] leading-none font-semibold text-[#5d6670] hover:bg-[#edf2f5] hover:text-[#20252a] lg:h-8 lg:min-w-0 lg:flex-row lg:gap-1.5 lg:rounded-full lg:px-2.5 lg:text-xs lg:leading-normal dark:text-[#a7b0ba] dark:hover:bg-[#242a30] dark:hover:text-[#eef2f4]"

const mobileMessageToolbarButtonClass =
  "h-14 min-w-0 flex-col gap-1 rounded-md px-1 text-[11px] leading-none font-semibold text-[#5d6670] hover:bg-[#edf2f5] hover:text-[#20252a] dark:text-[#a7b0ba] dark:hover:bg-[#242a30] dark:hover:text-[#eef2f4]"

export const MessageReaderPane = React.memo(function MessageReaderPane({
  downloadAttachment,
  emailRenderMode,
  handleForward,
  handleMessageIframeLoad,
  handleReply,
  messageContainerClassName,
  messageContainerStyle,
  messageHtmlPreparing,
  messageIframeHeight,
  messageIframeRef,
  messageLoading,
  messageThread,
  messageViewportStyle,
  messageWidthMode,
  moveSelectedMessageToCustomFolder,
  moveSelectedMessageToSpecial,
  openedMessage,
  onBackToList,
  onEmailRenderModeChange,
  onOpenThreadMessage,
  selectedMessage,
  selectedMessageHtmlDocument,
  selectedMessageId,
  setMessageWidthMode,
  updateMessageFlags,
}: {
  downloadAttachment: (
    messageId: string,
    attachment: AttachmentDto
  ) => void | Promise<void>
  emailRenderMode: EmailRenderMode
  handleForward: () => void
  handleMessageIframeLoad: (
    event: React.SyntheticEvent<HTMLIFrameElement>
  ) => void
  handleReply: () => void
  messageContainerClassName: string
  messageContainerStyle?: React.CSSProperties
  messageHtmlPreparing: boolean
  messageIframeHeight: number
  messageIframeRef: React.RefObject<HTMLIFrameElement | null>
  messageLoading: boolean
  messageThread: MessageThreadDto | null
  messageViewportStyle?: React.CSSProperties
  messageWidthMode: MessageWidthMode
  moveSelectedMessageToCustomFolder: () => void | Promise<void>
  moveSelectedMessageToSpecial: (specialUse: string) => void | Promise<void>
  openedMessage: MessageDto | MessageListItemDto | null
  onBackToList: () => void
  onEmailRenderModeChange: (mode: EmailRenderMode) => void
  onOpenThreadMessage: (messageId: string) => void
  selectedMessage: MessageDto | null
  selectedMessageHtmlDocument: string | null
  selectedMessageId: string | null
  setMessageWidthMode: React.Dispatch<React.SetStateAction<MessageWidthMode>>
  updateMessageFlags: (
    messageId: string,
    flags: { seen?: boolean; flagged?: boolean }
  ) => void | Promise<void>
}) {
  const { t } = useMailLocale()

  const mobileHeaderRef = React.useRef<HTMLDivElement>(null)
  const mobileHeaderTopRowRef = React.useRef<HTMLDivElement>(null)
  const mobileHeaderDetailsRef = React.useRef<HTMLDivElement>(null)
  const mobileHeaderBackLabelRef = React.useRef<HTMLSpanElement>(null)
  const messageViewportRef = React.useRef<HTMLDivElement>(null)
  const mobileHeaderAnimationFrameRef = React.useRef<number | null>(null)
  const pendingMobileHeaderScrollTopRef = React.useRef(0)
  const renderedIframeDocumentRef = React.useRef<Document | null>(null)
  const renderedIframeHtmlRef = React.useRef<string | null>(null)
  const mobileHeaderMetricsRef = React.useRef({
    backLabelWidth: 0,
    expandedHeight: 0,
    expandedPaddingInline: 16,
    expandedPaddingTop: 12,
  })

  const updateMessageIframeDocument = React.useCallback(
    (iframe: HTMLIFrameElement) => {
      let iframeDocument: Document | null

      try {
        iframeDocument = iframe.contentDocument
      } catch {
        return
      }

      if (
        !iframeDocument ||
        (renderedIframeDocumentRef.current === iframeDocument &&
          renderedIframeHtmlRef.current === selectedMessageHtmlDocument)
      ) {
        return
      }

      renderedIframeDocumentRef.current = iframeDocument
      renderedIframeHtmlRef.current = selectedMessageHtmlDocument
      iframeDocument.open()
      iframeDocument.write(selectedMessageHtmlDocument ?? "")
      iframeDocument.close()
    },
    [selectedMessageHtmlDocument]
  )

  React.useLayoutEffect(() => {
    const iframe = messageIframeRef.current

    if (iframe) {
      updateMessageIframeDocument(iframe)
    }
  }, [messageIframeRef, updateMessageIframeDocument])

  const applyMobileHeaderScroll = React.useCallback((scrollTop: number) => {
    const header = mobileHeaderRef.current

    if (!header || window.matchMedia("(min-width: 1024px)").matches) {
      return
    }

    const metrics = mobileHeaderMetricsRef.current
    const compactHeight = 53
    const collapseDistance = Math.max(
      metrics.expandedHeight - compactHeight,
      120
    )
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches
    const progress = prefersReducedMotion
      ? Number(scrollTop > 2)
      : Math.min(scrollTop / collapseDistance, 1)
    const viewport = messageViewportRef.current
    const detailsOpacity = 1 - progress
    const compactOpacity = Math.max(0, (progress - 0.2) / 0.8)
    const backLabelProgress = 1 - progress
    const interpolate = (expanded: number, compact: number) =>
      expanded + (compact - expanded) * progress

    if (viewport) {
      // While the header changes the viewport height, scroll anchoring would
      // otherwise resist a partial reverse gesture and keep it compact.
      viewport.style.overflowAnchor = progress > 0 && progress < 1 ? "none" : ""
    }

    header.style.setProperty(
      "--mobile-message-reader-header-height",
      `${interpolate(metrics.expandedHeight, compactHeight)}px`
    )
    header.style.setProperty(
      "--mobile-message-reader-header-padding-inline",
      `${interpolate(metrics.expandedPaddingInline, 12)}px`
    )
    header.style.setProperty(
      "--mobile-message-reader-header-padding-top",
      `${interpolate(metrics.expandedPaddingTop, 8)}px`
    )
    header.style.setProperty(
      "--mobile-message-reader-header-padding-bottom",
      `${interpolate(16, 8)}px`
    )
    header.style.setProperty(
      "--mobile-message-reader-top-row-margin",
      `${interpolate(12, 0)}px`
    )
    header.style.setProperty(
      "--mobile-message-reader-back-label-width",
      `${metrics.backLabelWidth * backLabelProgress}px`
    )
    header.style.setProperty(
      "--mobile-message-reader-back-label-opacity",
      `${backLabelProgress}`
    )
    header.style.setProperty(
      "--mobile-message-reader-back-button-gap",
      `${4 * backLabelProgress}px`
    )
    header.style.setProperty(
      "--mobile-message-reader-back-button-padding",
      `${8 * backLabelProgress}px`
    )
    header.style.setProperty(
      "--mobile-message-reader-details-opacity",
      `${detailsOpacity}`
    )
    header.style.setProperty(
      "--mobile-message-reader-details-offset",
      `${-6 * progress}px`
    )
    header.style.setProperty(
      "--mobile-message-reader-compact-opacity",
      `${compactOpacity}`
    )
  }, [])

  const measureMobileHeader = React.useCallback(() => {
    const header = mobileHeaderRef.current
    const topRow = mobileHeaderTopRowRef.current
    const details = mobileHeaderDetailsRef.current

    if (
      !header ||
      !topRow ||
      !details ||
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      return
    }

    const expandedPaddingInline = window.matchMedia("(min-width: 640px)")
      .matches
      ? 24
      : 16
    const expandedPaddingTop = expandedPaddingInline === 24 ? 20 : 12
    const borderHeight = header.offsetHeight - header.clientHeight

    mobileHeaderMetricsRef.current = {
      backLabelWidth: mobileHeaderBackLabelRef.current?.scrollWidth ?? 0,
      expandedHeight:
        expandedPaddingTop +
        topRow.offsetHeight +
        12 +
        details.scrollHeight +
        16 +
        borderHeight,
      expandedPaddingInline,
      expandedPaddingTop,
    }

    applyMobileHeaderScroll(messageViewportRef.current?.scrollTop ?? 0)
  }, [applyMobileHeaderScroll])

  React.useLayoutEffect(() => {
    measureMobileHeader()

    const details = mobileHeaderDetailsRef.current
    const resizeObserver = details
      ? new ResizeObserver(measureMobileHeader)
      : null

    if (details && resizeObserver) {
      resizeObserver.observe(details)
    }

    window.addEventListener("resize", measureMobileHeader)

    return () => {
      window.removeEventListener("resize", measureMobileHeader)
      resizeObserver?.disconnect()

      if (mobileHeaderAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(mobileHeaderAnimationFrameRef.current)
      }
    }
  }, [measureMobileHeader])

  const handleMessageViewportScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (window.matchMedia("(min-width: 1024px)").matches) {
        return
      }

      pendingMobileHeaderScrollTopRef.current = Math.max(
        0,
        event.currentTarget.scrollTop
      )

      if (mobileHeaderAnimationFrameRef.current !== null) {
        return
      }

      mobileHeaderAnimationFrameRef.current = window.requestAnimationFrame(
        () => {
          mobileHeaderAnimationFrameRef.current = null
          applyMobileHeaderScroll(pendingMobileHeaderScrollTopRef.current)
        }
      )
    },
    [applyMobileHeaderScroll]
  )

  const conversationMode = Boolean(
    messageThread && messageThread.messages.length > 1
  )
  const messageBodyLoading =
    (messageLoading && !selectedMessage) || messageHtmlPreparing
  const messageBodyContent = (
    <div
      className={cn(
        "relative",
        conversationMode
          ? "w-full bg-white dark:bg-[#15191d]"
          : messageContainerClassName
      )}
      style={messageContainerStyle}
    >
      {/* Keep one WebKit page/layer tree and replace only its document. */}
      <iframe
        aria-label={selectedMessage?.subject ?? t("Письмо", "Message")}
        className="block min-h-[560px] w-full border-0 bg-transparent"
        ref={messageIframeRef}
        referrerPolicy="no-referrer"
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
        src="about:blank"
        style={{ height: messageIframeHeight }}
        onLoad={(event) => {
          updateMessageIframeDocument(event.currentTarget)
          handleMessageIframeLoad(event)
        }}
      />
      {messageBodyLoading || !selectedMessageHtmlDocument ? (
        <div className="absolute inset-0 bg-white dark:bg-[#15191d]">
          {messageBodyLoading ? (
            <PaneState icon={<IconLoader2 className="size-5 animate-spin" />}>
              {t("Открываю письмо", "Opening message")}
            </PaneState>
          ) : (
            <PaneState icon={<IconFileText className="size-5" />}>
              {t(
                "Письмо без отображаемого тела",
                "This message has no displayable body"
              )}
            </PaneState>
          )}
        </div>
      ) : null}
    </div>
  )
  const updateSelectedMessageFlags = (flags: {
    seen?: boolean
    flagged?: boolean
  }) => {
    if (!selectedMessageId) {
      return
    }

    return updateMessageFlags(selectedMessageId, flags)
  }

  return (
    <MailReaderSurface open={Boolean(selectedMessageId)}>
      <div className={selectedMessageId ? "contents" : "hidden"}>
        <div className="shrink-0">
          <div
            className="mobile-message-reader-header sticky top-0 z-30 border-b border-[#d8dee5] bg-white/95 backdrop-blur lg:static lg:z-auto lg:h-auto lg:bg-white lg:px-6 lg:pt-5 lg:pb-4 lg:backdrop-blur-none dark:border-[#30353a] dark:bg-[#181b1f]/95 lg:dark:bg-[#181b1f]"
            ref={mobileHeaderRef}
          >
            <div
              className="mobile-message-reader-top-row flex min-w-0 items-center gap-2 lg:hidden"
              ref={mobileHeaderTopRowRef}
            >
              <Button
                aria-label={t(
                  "Вернуться к списку писем",
                  "Back to message list"
                )}
                className="mobile-message-reader-back-button h-9 shrink-0 text-[#5d6670] hover:bg-[#edf2f5] hover:text-[#20252a] dark:text-[#a7b0ba] dark:hover:bg-[#242a30] dark:hover:text-[#eef2f4]"
                size="sm"
                variant="ghost"
                onClick={onBackToList}
              >
                <IconArrowLeft className="size-4" />
                <span
                  className="mobile-message-reader-back-label"
                  ref={mobileHeaderBackLabelRef}
                >
                  <span>{t("Назад", "Back")}</span>
                </span>
              </Button>

              <div
                aria-hidden="true"
                className="mobile-message-reader-compact-summary min-w-0 flex-1"
              >
                <p className="truncate text-sm leading-tight font-semibold text-[#20252a] dark:text-[#eef2f4]">
                  {openedMessage?.subject ?? t("Без темы", "No subject")}
                </p>
                <p className="truncate text-xs text-[#8a949e] dark:text-[#8d98a3]">
                  {formatSenderName(openedMessage?.from)}
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    aria-label={t(
                      "Другие действия с письмом",
                      "More message actions"
                    )}
                    className="h-9 w-9 shrink-0 px-0 text-[#5d6670] hover:bg-[#edf2f5] hover:text-[#20252a] dark:text-[#a7b0ba] dark:hover:bg-[#242a30] dark:hover:text-[#eef2f4]"
                    size="sm"
                    variant="ghost"
                  >
                    <IconDots className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  collisionPadding={8}
                  sideOffset={8}
                  className="w-[min(calc(100vw-2rem),20rem)]"
                >
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      disabled={!selectedMessage}
                      onSelect={() =>
                        void updateSelectedMessageFlags({
                          seen: !selectedMessage?.seen,
                        })
                      }
                    >
                      {selectedMessage?.seen ? (
                        <IconEyeOff className="size-4" />
                      ) : (
                        <IconEye className="size-4" />
                      )}
                      {selectedMessage?.seen
                        ? t("Отметить непрочитанным", "Mark as unread")
                        : t("Отметить прочитанным", "Mark as read")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!selectedMessage}
                      onSelect={() => void moveSelectedMessageToCustomFolder()}
                    >
                      <IconFolder className="size-4" />
                      {t("Переместить", "Move")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!selectedMessage}
                      onSelect={() =>
                        void moveSelectedMessageToSpecial("\\Junk")
                      }
                    >
                      <IconFolderX className="size-4" />
                      {t("В спам", "Move to spam")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        setMessageWidthMode((currentMode) =>
                          currentMode === "full" ? "fixed" : "full"
                        )
                      }
                    >
                      {messageWidthMode === "full" ? (
                        <IconArrowsMinimize className="size-4" />
                      ) : (
                        <IconArrowsMaximize className="size-4" />
                      )}
                      {messageWidthMode === "full"
                        ? t("Фиксированная ширина", "Fixed width")
                        : t("На всю ширину", "Full width")}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>
                    {t("Отображение письма", "Message appearance")}
                  </DropdownMenuLabel>
                  <DropdownMenuGroup>
                    {emailRenderModeOptions.map((option) => {
                      const OptionIcon = option.icon

                      return (
                        <DropdownMenuItem
                          disabled={!selectedMessage}
                          key={option.mode}
                          onSelect={() => onEmailRenderModeChange(option.mode)}
                        >
                          <OptionIcon className="size-4" />
                          {option.label}
                          {emailRenderMode === option.mode ? (
                            <DropdownMenuShortcut>
                              <IconCheck className="size-4" />
                            </DropdownMenuShortcut>
                          ) : null}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div
              className="mobile-message-reader-details lg:transform-none lg:opacity-100"
              ref={mobileHeaderDetailsRef}
            >
              <div>
                <div className="min-w-0">
                  <h2 className="max-w-4xl text-xl leading-tight font-semibold text-[#1b2025] sm:text-2xl dark:text-[#f3f6f8]">
                    {openedMessage?.subject ?? t("Без темы", "No subject")}
                  </h2>
                </div>

                <div className="mt-4 flex items-start gap-3">
                  <MailSenderAvatar
                    address={openedMessage?.from}
                    key={openedMessage?.from?.address ?? "unknown"}
                  />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="max-w-full min-w-0 truncate font-semibold text-[#20252a] dark:text-[#eef2f4]">
                        {formatSenderName(openedMessage?.from)}
                      </span>
                      {openedMessage?.from?.address ? (
                        <span className="max-w-full min-w-0 truncate text-[#8a949e] dark:text-[#8d98a3]">
                          {openedMessage.from.address}
                        </span>
                      ) : null}
                      {openedMessage?.sentAt ? (
                        <time className="shrink-0 text-[#8a949e] dark:text-[#8d98a3]">
                          {formatDateTime(openedMessage.sentAt)}
                        </time>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-[#8a949e] dark:text-[#8d98a3]">
                      {t("Кому:", "To:")}
                      {formatAddressList(openedMessage?.to ?? [])}
                    </p>
                    {openedMessage?.openTracking?.enabled ||
                    openedMessage?.clickTracking?.enabled ? (
                      <div className="mt-2">
                        <TrackingStatus
                          clickTracking={openedMessage.clickTracking}
                          openTracking={openedMessage.openTracking}
                        />
                      </div>
                    ) : null}
                  </div>
                  {messageLoading ? (
                    <IconLoader2 className="mt-1 size-5 shrink-0 animate-spin text-[#68727d]" />
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="fixed right-0 bottom-0 left-0 z-40 grid grid-cols-4 gap-1 border-t border-[#d8dee5] bg-white/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-18px_38px_rgba(15,23,42,0.16)] backdrop-blur lg:hidden dark:border-[#30353a] dark:bg-[#181b1f]/95">
            <Button
              aria-label={t("Ответить", "Reply")}
              className={mobileMessageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={handleReply}
            >
              <IconCornerUpLeft className="size-4" />
              {t("Ответить", "Reply")}
            </Button>
            <Button
              aria-label={t("Переслать", "Forward")}
              className={mobileMessageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={handleForward}
            >
              <IconArrowForwardUp className="size-4" />
              {t("Переслать", "Forward")}
            </Button>
            <Button
              aria-label={
                selectedMessage?.flagged
                  ? t("Открепить письмо", "Unpin message")
                  : t("Закрепить письмо", "Pin message")
              }
              className={mobileMessageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={() =>
                void updateSelectedMessageFlags({
                  flagged: !selectedMessage?.flagged,
                })
              }
            >
              {selectedMessage?.flagged ? (
                <IconPinnedOff className="size-4 text-[#d99a19]" />
              ) : (
                <IconPinned className="size-4" />
              )}
              <span className="truncate">
                {selectedMessage?.flagged
                  ? t("Открепить", "Unpin")
                  : t("Закрепить", "Pin")}
              </span>
            </Button>
            <Button
              aria-label={t("Удалить", "Delete")}
              className={mobileMessageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={() => void moveSelectedMessageToSpecial("\\Trash")}
            >
              <IconTrash className="size-4" />
              {t("Удалить", "Delete")}
            </Button>
          </div>

          <div className="hidden flex-wrap items-center border-y border-[#e7ebef] bg-white px-6 py-2 lg:flex dark:border-[#2b3035] dark:bg-[#181b1f]">
            <Button
              aria-label={t("Ответить", "Reply")}
              className={messageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={handleReply}
            >
              <IconCornerUpLeft className="size-4" />
              {t("Ответить", "Reply")}
            </Button>
            <Button
              aria-label={t("Переслать", "Forward")}
              className={messageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={handleForward}
            >
              <IconArrowForwardUp className="size-4" />
              {t("Переслать", "Forward")}
            </Button>
            <Button
              aria-label={
                selectedMessage?.flagged
                  ? t("Открепить письмо", "Unpin message")
                  : t("Закрепить письмо", "Pin message")
              }
              className={messageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={() =>
                void updateSelectedMessageFlags({
                  flagged: !selectedMessage?.flagged,
                })
              }
            >
              {selectedMessage?.flagged ? (
                <IconPinnedOff className="size-4 text-[#d99a19]" />
              ) : (
                <IconPinned className="size-4" />
              )}
              <span className="truncate">
                {selectedMessage?.flagged
                  ? t("Открепить", "Unpin")
                  : t("Закрепить", "Pin")}
              </span>
            </Button>
            <Button
              aria-label={
                selectedMessage?.seen
                  ? t("Отметить непрочитанным", "Mark as unread")
                  : t("Отметить прочитанным", "Mark as read")
              }
              className={messageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={() =>
                void updateSelectedMessageFlags({
                  seen: !selectedMessage?.seen,
                })
              }
            >
              {selectedMessage?.seen ? (
                <IconEyeOff className="size-4" />
              ) : (
                <IconEye className="size-4" />
              )}
              {selectedMessage?.seen
                ? t("Непрочитано", "Unread")
                : t("Прочитано", "Read")}
            </Button>
            <Button
              aria-label={t("Удалить", "Delete")}
              className={messageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={() => void moveSelectedMessageToSpecial("\\Trash")}
            >
              <IconTrash className="size-4" />
              {t("Удалить", "Delete")}
            </Button>
            <Button
              aria-label={t("В спам", "Move to spam")}
              className={messageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={() => void moveSelectedMessageToSpecial("\\Junk")}
            >
              <IconFolderX className="size-4" />
              {t("В спам", "Move to spam")}
            </Button>
            <Button
              aria-label={t("Переместить", "Move")}
              className={messageToolbarButtonClass}
              disabled={!selectedMessage}
              size="sm"
              variant="ghost"
              onClick={() => void moveSelectedMessageToCustomFolder()}
            >
              <IconFolder className="size-4" />
              {t("Переместить", "Move")}
            </Button>
            <Button
              aria-label={
                messageWidthMode === "full"
                  ? t(
                      "Показать письмо в фиксированной ширине",
                      "Show message at a fixed width"
                    )
                  : t(
                      "Показать письмо на всю ширину",
                      "Show message at full width"
                    )
              }
              className={messageToolbarButtonClass}
              size="sm"
              variant="ghost"
              onClick={() =>
                setMessageWidthMode((currentMode) =>
                  currentMode === "full" ? "fixed" : "full"
                )
              }
            >
              {messageWidthMode === "full" ? (
                <IconArrowsMinimize className="size-4" />
              ) : (
                <IconArrowsMaximize className="size-4" />
              )}
              {t("Ширина", "Width")}
            </Button>
            <EmailRenderModeToggle
              disabled={!selectedMessage}
              mode={emailRenderMode}
              onChange={onEmailRenderModeChange}
            />
          </div>

          {selectedMessage?.attachments.length ? (
            <div className="flex flex-wrap gap-2 border-t border-[#e7ebef] px-4 py-2.5 sm:px-6 dark:border-[#2b3035]">
              {selectedMessage.attachments.map((attachment) => (
                <button
                  className="flex max-w-full items-center gap-2 border border-[#d8dee5] bg-[#f7f9fa] px-3 py-1.5 text-left text-xs text-[#4c5661] hover:border-[#b9c4ce] hover:bg-[#edf2f5] dark:border-[#30353a] dark:bg-[#101214] dark:text-[#c4ccd4] dark:hover:border-[#424a52] dark:hover:bg-[#242a30]"
                  key={attachment.id}
                  type="button"
                  onClick={() =>
                    void downloadAttachment(selectedMessage.id, attachment)
                  }
                >
                  <IconPaperclip className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">
                    {getAttachmentDownloadName(attachment)}
                  </span>
                  {attachment.sizeBytes ? (
                    <span className="shrink-0 text-[#8a949e] dark:text-[#8d98a3]">
                      {formatAttachmentSize(attachment.sizeBytes)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div
          className="custom-scrollbar min-h-0 flex-1 overflow-auto bg-[#eef1f4] pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0 dark:bg-[#101214]"
          ref={messageViewportRef}
          style={messageViewportStyle}
          onScroll={handleMessageViewportScroll}
        >
          <MessageConversation
            currentMessageId={selectedMessageId}
            messageBody={messageBodyContent}
            selectedMessage={selectedMessage}
            thread={messageThread}
            onOpenMessage={onOpenThreadMessage}
          />
        </div>
      </div>
      {!selectedMessageId ? (
        <PaneState icon={<IconMail className="size-6" />}>
          {t("Выбери письмо в списке", "Select a message in the list")}
        </PaneState>
      ) : null}
    </MailReaderSurface>
  )
})

function getAttachmentDownloadName(attachment: AttachmentDto) {
  return attachment.filename?.trim() || mailText("Вложение", "Attachment")
}
