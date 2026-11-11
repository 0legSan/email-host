import { useMailLocale } from "@workspace/mail-design"
import { mailApiFetch } from "@/lib/api-transport"
import * as React from "react"
import { closeMailNotifications } from "@workspace/pwa/client"
import { type MessageListCacheData } from "@/features/mail/controller/mail-controller-config"
import { findSpecialMailbox } from "@/features/mail/utils/mail-format"
import {
  type AttachmentDto,
  type MailboxDto,
  type MessageDto,
  type MessageListItemDto,
  type MessageThreadDto,
  type RequestError,
} from "@/lib/api-client"
import { queryKeys } from "@/lib/query-keys"
import {
  persistPendingMessageMutation,
  persistPendingMessageMutations,
  type PendingMessageMutationInput,
} from "@/lib/offline-mail-cache"
import {
  buildForwardHtml,
  findMessageListItemInSnapshot,
  getAttachmentDownloadName,
  getUnreadCountDelta,
  handleBackgroundRequestError,
  handleRequestError,
  isNetworkOffline,
  patchMailboxListUnreadCount,
  patchMailboxesByAccountUnreadCount,
  patchMessageListItemData,
  patchMessageListStatesData,
  patchMessageThreadWithRealtimeStates,
  patchMessageWithRealtimeState,
  removeMessageListItemsData,
  restoreMessageListSnapshot,
  withSubjectPrefix,
} from "./mail-controller-helpers"
import type { MailBasicActionsContext } from "./use-mail-basic-actions"

export function useMailMessageActions(context: MailBasicActionsContext) {
  const { t } = useMailLocale()

  const {
    accounts,
    applySynchronizedMessage,
    checkedMessages,
    customMoveTargetPath,
    flushPendingMessageMutations,
    invalidateMessageDetailCaches,
    invalidateMessageListCaches,
    mailboxesByAccount,
    messages,
    moveMessageMutation,
    mutateMessageFlags,
    navigateToMailList,
    navigateToMessage,
    openComposer,
    queryClient,
    selectedMessage,
    selectedMessageId,
    selectedMessageIds,
    sendMessageFlagMutations,
    setAuthStatus,
    setCustomMoveDialogOpen,
    setCustomMoveTargetPath,
    setErrorMessage,
    setMailboxesByAccount,
    setMessageThread,
    setRefreshKey,
    setSelectedMessage,
    setSelectedMessageIds,
  } = context
  function applyMailboxUnreadDelta(
    message: Pick<MessageListItemDto, "accountId" | "path">,
    delta: number
  ) {
    const { accountId, path } = message

    if (!accountId || !path || delta === 0) {
      return
    }

    setMailboxesByAccount((currentMailboxesByAccount) =>
      patchMailboxesByAccountUnreadCount(
        currentMailboxesByAccount,
        accountId,
        path,
        delta
      )
    )
    queryClient.setQueryData<{ mailboxes: MailboxDto[] }>(
      queryKeys.mailboxes(accountId),
      (data) =>
        data
          ? {
              mailboxes: patchMailboxListUnreadCount(
                data.mailboxes,
                path,
                delta
              ),
            }
          : data
    )
  }
  function applyMailboxUnreadMove(
    message: Pick<MessageListItemDto, "accountId" | "path" | "seen">,
    targetPath: string,
    direction: 1 | -1
  ) {
    if (message.seen || !message.path || message.path === targetPath) {
      return
    }

    applyMailboxUnreadDelta(message, -direction)
    applyMailboxUnreadDelta(
      {
        accountId: message.accountId,
        path: targetPath,
      },
      direction
    )
  }
  async function updateMessageFlags(
    messageId: string,
    flags: {
      seen?: boolean
      flagged?: boolean
    }
  ) {
    if (flags.seen) {
      void closeMailNotifications([messageId])
    }

    void queryClient.cancelQueries({
      queryKey: queryKeys.messageLists(),
    })
    void queryClient.cancelQueries({
      queryKey: queryKeys.messageDetail(messageId),
      exact: true,
    })
    void queryClient.cancelQueries({
      queryKey: queryKeys.messageThread(messageId),
      exact: true,
    })

    const previousDetail = queryClient.getQueryData<{ message: MessageDto }>(
      queryKeys.messageDetail(messageId)
    )
    const previousMessageLists =
      queryClient.getQueriesData<MessageListCacheData>({
        queryKey: queryKeys.messageLists(),
      })
    const previousListMessage = findMessageListItemInSnapshot(
      previousMessageLists,
      messageId
    )
    const previousMessageForUnread =
      selectedMessage?.id === messageId
        ? selectedMessage
        : previousDetail?.message.id === messageId
          ? previousDetail.message
          : previousListMessage
    const optimisticUnreadDelta =
      typeof flags.seen === "boolean" && previousMessageForUnread
        ? getUnreadCountDelta(previousMessageForUnread.seen, flags.seen)
        : 0

    queryClient.setQueriesData<MessageListCacheData>(
      {
        queryKey: queryKeys.messageLists(),
      },
      (data) => patchMessageListItemData(data, messageId, flags)
    )
    setSelectedMessage((currentMessage) =>
      currentMessage?.id === messageId
        ? {
            ...currentMessage,
            ...flags,
          }
        : currentMessage
    )
    if (optimisticUnreadDelta !== 0 && previousMessageForUnread) {
      applyMailboxUnreadDelta(previousMessageForUnread, optimisticUnreadDelta)
    }
    if (previousDetail?.message.id === messageId) {
      queryClient.setQueryData(queryKeys.messageDetail(messageId), {
        message: {
          ...previousDetail.message,
          ...flags,
        },
      })
    }
    setMessageThread((currentThread) =>
      currentThread
        ? {
            ...currentThread,
            messages: currentThread.messages.map((message) =>
              message.id === messageId ? { ...message, ...flags } : message
            ),
          }
        : currentThread
    )
    queryClient.setQueryData<{ thread: MessageThreadDto }>(
      queryKeys.messageThread(messageId),
      (data) =>
        data
          ? {
              thread: {
                ...data.thread,
                messages: data.thread.messages.map((message) =>
                  message.id === messageId ? { ...message, ...flags } : message
                ),
              },
            }
          : data
    )

    const clientMutationId = crypto.randomUUID()

    if (previousMessageForUnread) {
      const mutation = await persistPendingMessageMutation({
        message: previousMessageForUnread,
        clientMutationId,
        flags,
      })

      if (mutation) {
        if (!isNetworkOffline()) {
          void flushPendingMessageMutations().catch((error) => {
            handleBackgroundRequestError(error, setAuthStatus)
          })
        }
        return
      }
    }

    if (!isNetworkOffline()) {
      const data = await mutateMessageFlags({
        clientMutationId,
        flags,
        messageId,
      })
      applySynchronizedMessage(data.message)
      invalidateMessageListCaches()
    }
  }
  async function updateCheckedMessageFlags(flags: {
    seen?: boolean
    flagged?: boolean
  }) {
    if (checkedMessages.length === 0) {
      return
    }

    const messageStates = checkedMessages.map((message) => ({
      id: message.id,
      seen: flags.seen ?? message.seen,
      flagged: flags.flagged ?? message.flagged,
    }))
    const statesById = new Map(messageStates.map((state) => [state.id, state]))
    const clientMutations: PendingMessageMutationInput[] = checkedMessages.map(
      (message) => ({
        message,
        clientMutationId: crypto.randomUUID(),
        flags,
      })
    )

    if (flags.seen) {
      void closeMailNotifications(checkedMessages.map((message) => message.id))
    }

    void queryClient.cancelQueries({
      queryKey: queryKeys.messageLists(),
    })
    queryClient.setQueriesData<MessageListCacheData>(
      { queryKey: queryKeys.messageLists() },
      (data) => patchMessageListStatesData(data, messageStates)
    )
    queryClient.setQueriesData<{ message: MessageDto }>(
      { queryKey: queryKeys.messageDetails() },
      (data) => {
        if (!data) return data
        const message = patchMessageWithRealtimeState(data.message, statesById)
        return message === data.message ? data : { message }
      }
    )
    queryClient.setQueriesData<{ thread: MessageThreadDto }>(
      { queryKey: queryKeys.messageThreads() },
      (data) => {
        if (!data) return data
        const thread = patchMessageThreadWithRealtimeStates(
          data.thread,
          statesById
        )
        return thread === data.thread ? data : { thread }
      }
    )
    setSelectedMessage((message) =>
      message ? patchMessageWithRealtimeState(message, statesById) : message
    )
    setMessageThread((thread) =>
      thread ? patchMessageThreadWithRealtimeStates(thread, statesById) : thread
    )

    const unreadDeltas = new Map<
      string,
      {
        message: Pick<MessageListItemDto, "accountId" | "path">
        delta: number
      }
    >()
    for (const message of checkedMessages) {
      const nextSeen = flags.seen ?? message.seen
      const delta = getUnreadCountDelta(message.seen, nextSeen)

      if (!message.accountId || !message.path || delta === 0) continue
      const key = `${message.accountId}:${message.path}`
      const current = unreadDeltas.get(key)
      unreadDeltas.set(key, {
        message,
        delta: (current?.delta ?? 0) + delta,
      })
    }
    for (const { message, delta } of unreadDeltas.values()) {
      applyMailboxUnreadDelta(message, delta)
    }

    setSelectedMessageIds(new Set())

    try {
      const persistedMutations =
        await persistPendingMessageMutations(clientMutations)

      if (isNetworkOffline()) {
        return
      }

      if (persistedMutations.length > 0) {
        void flushPendingMessageMutations().catch((error) => {
          handleBackgroundRequestError(error, setAuthStatus)
        })
        return
      }

      const now = new Date().toISOString()
      await sendMessageFlagMutations(
        clientMutations.map((mutation) => ({
          messageId: mutation.message.id,
          clientMutationId: mutation.clientMutationId,
          accountId: mutation.message.accountId,
          path: mutation.message.path,
          previousSeen: mutation.message.seen,
          flags: mutation.flags,
          createdAt: now,
          updatedAt: now,
        }))
      )
    } catch (error) {
      handleRequestError(error, setErrorMessage, setAuthStatus)
    }
  }
  async function toggleMessageFlagged(message: MessageListItemDto) {
    try {
      await updateMessageFlags(message.id, {
        flagged: !message.flagged,
      })
    } catch (error) {
      handleRequestError(error, setErrorMessage, setAuthStatus)
    }
  }
  async function downloadAttachment(
    messageId: string,
    attachment: AttachmentDto
  ) {
    try {
      const response = await mailApiFetch(
        `/api/mail/messages/${messageId}/attachments/${attachment.id}`,
        {
          credentials: "include",
        }
      )

      if (!response.ok) {
        const error = new Error(
          `Request failed with status ${response.status}`
        ) as RequestError
        error.status = response.status
        throw error
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")

      link.href = url
      link.download = getAttachmentDownloadName(attachment)
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      handleRequestError(error, setErrorMessage, setAuthStatus)
    }
  }
  function handleReply() {
    if (!selectedMessage) {
      return
    }

    openComposer({
      title: t("Ответ", "Reply"),
      accountId: selectedMessage.accountId ?? accounts[0]?.id ?? "",
      to: selectedMessage.from?.address ?? "",
      cc: "",
      bcc: "",
      subject: withSubjectPrefix(selectedMessage.subject, "Re:"),
      html: "",
      referenceMessageId: selectedMessage.id,
      mode: "reply",
    })
  }
  function handleForward() {
    if (!selectedMessage) {
      return
    }

    openComposer({
      title: t("Переслать", "Forward"),
      accountId: selectedMessage.accountId ?? accounts[0]?.id ?? "",
      to: "",
      cc: "",
      bcc: "",
      subject: withSubjectPrefix(selectedMessage.subject, "Fwd:"),
      html: buildForwardHtml(selectedMessage),
      referenceMessageId: selectedMessage.id,
      mode: "forward",
    })
  }
  async function moveSelectedMessageToSpecial(specialUse: string) {
    if (!selectedMessage?.accountId) {
      return
    }

    const targetMailbox = findSpecialMailbox(
      mailboxesByAccount[selectedMessage.accountId] ?? [],
      specialUse
    )

    if (!targetMailbox) {
      setErrorMessage(
        t(
          "Целевая папка не найдена для этого аккаунта",
          "Destination folder not found for this account"
        )
      )
      return
    }

    await moveSelectedMessage(targetMailbox.path)
  }
  function moveSelectedMessageToCustomFolder() {
    if (!selectedMessage?.accountId) {
      return
    }

    const availableMailboxes =
      mailboxesByAccount[selectedMessage.accountId] ?? []
    const defaultTargetPath =
      availableMailboxes.find((mailbox) => mailbox.specialUse === "\\Archive")
        ?.path ??
      selectedMessage.path ??
      ""

    setCustomMoveTargetPath(defaultTargetPath)
    setCustomMoveDialogOpen(true)
  }
  async function handleCustomMoveSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    const targetPath = customMoveTargetPath.trim()

    if (!targetPath) {
      return
    }

    setCustomMoveDialogOpen(false)
    await moveSelectedMessage(targetPath)
  }
  async function moveSelectedMessage(targetPath: string) {
    if (!selectedMessageId) {
      return
    }

    const messageId = selectedMessageId
    const previousSelectedMessageIds = selectedMessageIds
    const previousSelectedMessage = selectedMessage
    const movedMessage =
      previousSelectedMessage ??
      messages.find((message) => message.id === messageId) ??
      null
    const movedMessageIds = new Set([messageId])
    const previousMessageLists =
      queryClient.getQueriesData<MessageListCacheData>({
        queryKey: queryKeys.messageLists(),
      })

    queryClient.setQueriesData<MessageListCacheData>(
      {
        queryKey: queryKeys.messageLists(),
      },
      (data) => removeMessageListItemsData(data, movedMessageIds)
    )
    setSelectedMessageIds((currentMessageIds) => {
      if (!currentMessageIds.has(messageId)) {
        return currentMessageIds
      }

      const nextMessageIds = new Set(currentMessageIds)
      nextMessageIds.delete(messageId)
      return nextMessageIds
    })
    setSelectedMessage(null)
    navigateToMailList({}, true)
    if (movedMessage) {
      applyMailboxUnreadMove(movedMessage, targetPath, 1)
    }

    try {
      const data = await moveMessageMutation.mutateAsync({
        messageId,
        targetPath,
      })

      queryClient.setQueryData(queryKeys.messageDetail(messageId), data)
      invalidateMessageDetailCaches(movedMessageIds)
      invalidateMessageListCaches()
      setRefreshKey((currentKey) => currentKey + 1)
    } catch (error) {
      restoreMessageListSnapshot(queryClient, previousMessageLists)
      setSelectedMessageIds(previousSelectedMessageIds)
      setSelectedMessage(previousSelectedMessage)
      if (movedMessage) {
        applyMailboxUnreadMove(movedMessage, targetPath, -1)
      }
      navigateToMessage(messageId)
      handleRequestError(error, setErrorMessage, setAuthStatus)
    }
  }
  async function moveMessageListItemToSpecial(
    message: MessageListItemDto,
    specialUse: string
  ) {
    if (!message.accountId) {
      setErrorMessage(
        t(
          "Не найден аккаунт для выбранного письма",
          "Account not found for the selected message"
        )
      )
      return
    }

    const targetMailbox = findSpecialMailbox(
      mailboxesByAccount[message.accountId] ?? [],
      specialUse
    )

    if (!targetMailbox) {
      setErrorMessage(
        t(
          "Целевая папка не найдена для выбранного письма",
          "Destination folder not found for the selected message"
        )
      )
      return
    }

    const movedMessageIds = new Set([message.id])
    const previousSelectedMessageIds = selectedMessageIds
    const previousSelectedMessage = selectedMessage
    const previousMessageLists =
      queryClient.getQueriesData<MessageListCacheData>({
        queryKey: queryKeys.messageLists(),
      })

    queryClient.setQueriesData<MessageListCacheData>(
      {
        queryKey: queryKeys.messageLists(),
      },
      (data) => removeMessageListItemsData(data, movedMessageIds)
    )
    setSelectedMessageIds((currentMessageIds) => {
      if (!currentMessageIds.has(message.id)) {
        return currentMessageIds
      }

      const nextMessageIds = new Set(currentMessageIds)
      nextMessageIds.delete(message.id)
      return nextMessageIds
    })
    if (selectedMessageId === message.id) {
      setSelectedMessage(null)
      navigateToMailList({}, true)
    }
    applyMailboxUnreadMove(message, targetMailbox.path, 1)

    try {
      await moveMessageMutation.mutateAsync({
        messageId: message.id,
        targetPath: targetMailbox.path,
      })
      invalidateMessageListCaches()
      invalidateMessageDetailCaches(movedMessageIds)
      setRefreshKey((currentKey) => currentKey + 1)
    } catch (error) {
      restoreMessageListSnapshot(queryClient, previousMessageLists)
      setSelectedMessageIds(previousSelectedMessageIds)
      setSelectedMessage(previousSelectedMessage)
      applyMailboxUnreadMove(message, targetMailbox.path, -1)
      if (selectedMessageId === message.id) {
        navigateToMessage(message.id)
      }
      handleRequestError(error, setErrorMessage, setAuthStatus)
    }
  }
  async function moveCheckedMessagesToSpecial(specialUse: string) {
    if (checkedMessages.length === 0) {
      return
    }

    const moveRequests: Array<{
      message: MessageListItemDto
      messageId: string
      targetPath: string
    }> = []

    for (const message of checkedMessages) {
      if (!message.accountId) {
        setErrorMessage(
          t(
            "Не найден аккаунт для выбранного письма",
            "Account not found for the selected message"
          )
        )
        return
      }

      const targetMailbox = findSpecialMailbox(
        mailboxesByAccount[message.accountId] ?? [],
        specialUse
      )

      if (!targetMailbox) {
        setErrorMessage(
          t(
            "Целевая папка не найдена для выбранных писем",
            "Destination folder not found for the selected messages"
          )
        )
        return
      }

      moveRequests.push({
        message,
        messageId: message.id,
        targetPath: targetMailbox.path,
      })
    }

    const previousSelectedMessageIds = selectedMessageIds
    const previousSelectedMessage = selectedMessage
    const movedMessageIds = new Set(
      moveRequests.map(({ messageId }) => messageId)
    )
    const previousMessageLists =
      queryClient.getQueriesData<MessageListCacheData>({
        queryKey: queryKeys.messageLists(),
      })

    queryClient.setQueriesData<MessageListCacheData>(
      {
        queryKey: queryKeys.messageLists(),
      },
      (data) => removeMessageListItemsData(data, movedMessageIds)
    )
    setSelectedMessageIds((currentMessageIds) => {
      const nextMessageIds = new Set(currentMessageIds)

      for (const messageId of movedMessageIds) {
        nextMessageIds.delete(messageId)
      }

      return nextMessageIds
    })

    if (selectedMessageId && movedMessageIds.has(selectedMessageId)) {
      setSelectedMessage(null)
      navigateToMailList({}, true)
    }
    for (const { message, targetPath } of moveRequests) {
      applyMailboxUnreadMove(message, targetPath, 1)
    }

    try {
      await Promise.all(
        moveRequests.map(({ messageId, targetPath }) =>
          moveMessageMutation.mutateAsync({
            messageId,
            targetPath,
          })
        )
      )

      invalidateMessageListCaches()
      invalidateMessageDetailCaches(movedMessageIds)
      setRefreshKey((currentKey) => currentKey + 1)
    } catch (error) {
      restoreMessageListSnapshot(queryClient, previousMessageLists)
      setSelectedMessageIds(previousSelectedMessageIds)
      setSelectedMessage(previousSelectedMessage)
      for (const { message, targetPath } of moveRequests) {
        applyMailboxUnreadMove(message, targetPath, -1)
      }
      if (selectedMessageId && movedMessageIds.has(selectedMessageId)) {
        navigateToMessage(selectedMessageId)
      }
      handleRequestError(error, setErrorMessage, setAuthStatus)
    }
  }

  return {
    applyMailboxUnreadDelta,
    applyMailboxUnreadMove,
    downloadAttachment,
    handleCustomMoveSubmit,
    handleForward,
    handleReply,
    moveCheckedMessagesToSpecial,
    moveMessageListItemToSpecial,
    moveSelectedMessage,
    moveSelectedMessageToCustomFolder,
    moveSelectedMessageToSpecial,
    toggleMessageFlagged,
    updateCheckedMessageFlags,
    updateMessageFlags,
  }
}

export type MailMessageActionsContext = MailBasicActionsContext &
  ReturnType<typeof useMailMessageActions>
