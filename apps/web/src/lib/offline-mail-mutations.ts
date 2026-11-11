import type {
  BootstrapDto,
  MessageListItemDto,
  MessagePageDto,
  MessageThreadDto,
} from "./api-client"
import type { PendingMessageMutation } from "./offline-mail-cache"

export function patchMessage<T extends MessageListItemDto>(
  message: T,
  mutation: PendingMessageMutation
) {
  return message.id === mutation.messageId
    ? {
        ...message,
        ...mutation.flags,
      }
    : message
}

export function patchMessageState<T extends MessageListItemDto>(
  message: T,
  statesById: Map<string, Pick<MessageListItemDto, "id" | "seen" | "flagged">>
) {
  const state = statesById.get(message.id)

  if (
    !state ||
    (message.seen === state.seen && message.flagged === state.flagged)
  ) {
    return message
  }

  return {
    ...message,
    seen: state.seen,
    flagged: state.flagged,
  }
}

export function patchMessagePageStates(
  page: MessagePageDto,
  statesById: Map<string, Pick<MessageListItemDto, "id" | "seen" | "flagged">>
) {
  let changed = false
  const messages = page.messages.map((message) => {
    const nextMessage = patchMessageState(message, statesById)

    if (nextMessage !== message) {
      changed = true
    }

    return nextMessage
  })

  return changed ? { ...page, messages } : page
}

export function patchMessageThreadStates(
  thread: MessageThreadDto,
  statesById: Map<string, Pick<MessageListItemDto, "id" | "seen" | "flagged">>
) {
  let changed = false
  const messages = thread.messages.map((message) => {
    const nextMessage = patchMessageState(message, statesById)

    if (nextMessage !== message) {
      changed = true
    }

    return nextMessage
  })

  return changed ? { ...thread, messages } : thread
}

export function patchMessagePage(
  page: MessagePageDto,
  mutation: PendingMessageMutation
) {
  return {
    ...page,
    messages: page.messages.map((message) => patchMessage(message, mutation)),
  }
}

export function patchMessageThread(
  thread: MessageThreadDto,
  mutation: PendingMessageMutation
) {
  return {
    ...thread,
    messages: thread.messages.map((message) => patchMessage(message, mutation)),
  }
}

export function patchBootstrap(
  data: BootstrapDto,
  mutation: PendingMessageMutation,
  previousSeen: boolean | undefined
) {
  const nextSeen = mutation.flags.seen
  const effectivePreviousSeen = previousSeen ?? mutation.previousSeen
  const unreadDelta =
    typeof nextSeen === "boolean" && nextSeen !== effectivePreviousSeen
      ? nextSeen
        ? -1
        : 1
      : 0
  const mailboxesByAccount =
    unreadDelta !== 0 && mutation.accountId && mutation.path
      ? {
          ...data.mailboxesByAccount,
          [mutation.accountId]: (
            data.mailboxesByAccount[mutation.accountId] ?? []
          ).map((mailbox) =>
            mailbox.path === mutation.path
              ? {
                  ...mailbox,
                  messagesUnread:
                    mailbox.messagesUnread === null
                      ? null
                      : Math.max(0, mailbox.messagesUnread + unreadDelta),
                }
              : mailbox
          ),
        }
      : data.mailboxesByAccount

  return {
    ...data,
    mailboxesByAccount,
    initialMessages: {
      ...data.initialMessages,
      page: patchMessagePage(data.initialMessages.page, mutation),
    },
  }
}
