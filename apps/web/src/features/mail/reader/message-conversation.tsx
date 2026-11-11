import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import IconPaperclip from "@tabler/icons-react/dist/esm/icons/IconPaperclip.mjs"
import {
  MailConversationList,
  MailConversationRow,
  MailConversationSummary,
  MailConversationSurface,
  MailSenderAvatar,
} from "@workspace/mail-design"
import { cn } from "@workspace/ui/lib/utils"
import {
  formatAddressList,
  compactNumber,
  formatDraftCount,
  formatMessageCount,
  formatSenderName,
  formatShortDateTime,
  formatThreadMailboxLabel,
} from "@/features/mail/utils/mail-format"
import type {
  MessageDto,
  MessageThreadDto,
  MessageThreadItemDto,
} from "@/lib/api-client"

export const MessageConversation = React.memo(function MessageConversation({
  currentMessageId,
  messageBody,
  selectedMessage,
  thread,
  onOpenMessage,
}: {
  currentMessageId: string | null
  messageBody: React.ReactNode
  selectedMessage: MessageDto | null
  thread: MessageThreadDto | null
  onOpenMessage: (messageId: string) => void
}) {
  const { t } = useMailLocale()

  const currentMessageRef = React.useRef<HTMLDivElement>(null)
  const [messageExpansion, setMessageExpansion] = React.useState({
    messageId: currentMessageId,
    expanded: true,
  })
  const conversationId = thread && thread.messages.length > 1 ? thread.id : null

  React.useLayoutEffect(() => {
    if (!conversationId || !currentMessageId) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      currentMessageRef.current?.scrollIntoView({ block: "nearest" })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [conversationId, currentMessageId])

  const conversationMessages = conversationId ? (thread?.messages ?? []) : []
  const currentMessageIndex = conversationMessages.findIndex(
    (message) => message.id === currentMessageId
  )
  const draftCount = conversationMessages.filter(
    (message) => message.isDraft
  ).length
  const currentMessageExpanded =
    messageExpansion.messageId !== currentMessageId || messageExpansion.expanded

  return (
    <MailConversationSurface active={Boolean(conversationId)}>
      {conversationId ? (
        <MailConversationSummary
          draftLabel={
            draftCount > 0
              ? `${compactNumber(draftCount)} ${formatDraftCount(draftCount)}`
              : null
          }
          historyLabel={t(
            `${compactNumber(conversationMessages.length)} ${formatMessageCount(conversationMessages.length)}, история выше`,
            `${compactNumber(conversationMessages.length)} ${formatMessageCount(conversationMessages.length)}, earlier history above`
          )}
        />
      ) : null}
      <MailConversationList active={Boolean(conversationId)}>
        {conversationMessages.map((message, messageIndex) => (
          <ConversationMessageRow
            current={message.id === currentMessageId}
            currentMessageRef={currentMessageRef}
            expanded={message.id === currentMessageId && currentMessageExpanded}
            key={message.id}
            message={message}
            order={messageIndex * 2}
            selectedMessage={selectedMessage}
            onToggle={() => {
              if (message.id === currentMessageId) {
                setMessageExpansion((currentExpansion) => ({
                  messageId: currentMessageId,
                  expanded:
                    currentExpansion.messageId === currentMessageId
                      ? !currentExpansion.expanded
                      : false,
                }))
                return
              }

              onOpenMessage(message.id)
            }}
          />
        ))}
        <div
          className={cn(
            conversationId
              ? "border-b border-[#edf0f3] dark:border-[#242a30]"
              : "contents",
            conversationId &&
              currentMessageIndex === conversationMessages.length - 1 &&
              "border-b-0"
          )}
          hidden={Boolean(conversationId && !currentMessageExpanded)}
          id={
            conversationId && currentMessageId
              ? `conversation-message-${currentMessageId}`
              : undefined
          }
          style={
            conversationId
              ? { order: Math.max(0, currentMessageIndex) * 2 + 1 }
              : undefined
          }
        >
          {messageBody}
        </div>
      </MailConversationList>
    </MailConversationSurface>
  )
})

function ConversationMessageRow({
  current,
  currentMessageRef,
  expanded,
  message,
  order,
  selectedMessage,
  onToggle,
}: {
  current: boolean
  currentMessageRef: React.RefObject<HTMLDivElement | null>
  expanded: boolean
  message: MessageThreadItemDto
  order: number
  selectedMessage: MessageDto | null
  onToggle: () => void
}) {
  const { t } = useMailLocale()

  return (
    <div style={{ order }}>
      <MailConversationRow
        address={message.from?.address}
        avatar={<MailSenderAvatar address={message.from} />}
        badges={<ConversationBadges message={message} />}
        current={current}
        expanded={expanded}
        messageId={message.id}
        ref={current ? currentMessageRef : undefined}
        sender={formatSenderName(message.from)}
        summary={
          expanded
            ? t(
                `Кому: ${formatAddressList(selectedMessage?.to ?? message.to)}`,
                `To: ${formatAddressList(selectedMessage?.to ?? message.to)}`
              )
            : message.snippet || message.subject || t("Без текста", "No text")
        }
        timeLabel={formatShortDateTime(message.sentAt)}
        unread={!message.seen}
        onToggle={onToggle}
      />
    </div>
  )
}

function ConversationBadges({ message }: { message: MessageThreadItemDto }) {
  const { t } = useMailLocale()

  return (
    <>
      {message.isDraft ? (
        <span className="shrink-0 border border-[#f0c56b] bg-[#fff6dd] px-1.5 py-0.5 text-[11px] font-medium text-[#8a5c00] dark:border-[#5b4520] dark:bg-[#2a2111] dark:text-[#f4d58b]">
          {t("Черновик", "Draft")}
        </span>
      ) : null}
      {message.mailboxSpecialUse || message.mailboxName ? (
        <span className="shrink-0 border border-[#d8dee5] bg-[#f7f9fa] px-1.5 py-0.5 text-[11px] text-[#68727d] dark:border-[#30353a] dark:bg-[#101214] dark:text-[#a7b0ba]">
          {formatThreadMailboxLabel(message)}
        </span>
      ) : null}
      {message.hasAttachments ? (
        <IconPaperclip className="size-3.5 shrink-0 text-[#8a949e] dark:text-[#8d98a3]" />
      ) : null}
    </>
  )
}
