/* eslint-disable react-hooks/exhaustive-deps -- composed controller contexts expose stable React setters and refs that the rule cannot infer. */
import * as React from "react"
import { useMutation } from "@tanstack/react-query"
import { isPwaMessageOfType } from "@workspace/pwa/client"
import { useMutation as useConvexMutation } from "convex/react"
import {
  messageFlagsBatchSize,
  type MessageListCacheData,
} from "@/features/mail/controller/mail-controller-config"
import { chunkItems } from "@/features/mail/controller/mail-controller-storage"
import { useEvent } from "@/features/mail/message-list/use-pull-to-refresh"
import { sumSpecialMailboxUnreadCount } from "@/features/mail/utils/mail-format"
import { api } from "../../../../../../convex/_generated/api"
import { apiFetch, type MessageDto } from "@/lib/api-client"
import { markPerformance, measurePerformance } from "@/lib/performance"
import { queryKeys } from "@/lib/query-keys"
import {
  getOfflineMailCacheStatus,
  listPendingMessageMutations,
  pruneOfflineMailCache,
  removePendingMessageMutations,
  type PendingMessageMutation,
} from "@/lib/offline-mail-cache"
import {
  getCurrentNetworkOnline,
  handleBackgroundRequestError,
  invalidateCachedQueries,
  isNetworkOffline,
  moveMessage,
  patchMessageListItemData,
} from "./mail-controller-helpers"
import type { MailRealtimeContext } from "./use-mail-realtime"

export function useMailMutations(context: MailRealtimeContext) {
  const {
    accounts,
    activeSelectedMessage,
    authStatus,
    currentMessageListWindowPage,
    firstMailDataMarkedRef,
    mailboxesByAccount,
    messageListScopeKey,
    messageListWindowPages,
    messageThread,
    messages,
    networkOnline,
    offlineCacheSettings,
    offlineCacheSettingsRef,
    offlineModeActive,
    offlineWarmMessageAbortRef,
    offlineWarmMessageIdsRef,
    offlineWarmMessageQueueRef,
    offlineWarmVisibleMessagesRef,
    pendingMessageSyncPromiseRef,
    pendingMessageSyncRetryRef,
    persistOpenedMessage,
    queryClient,
    refetchMessageList,
    refreshKey,
    searchQuery,
    selectedMessageId,
    selectedMessageIds,
    setAuthStatus,
    setNetworkOnline,
    setOfflineCacheStatus,
    setSearchInput,
    setSelectedMessage,
    setSelectedMessageIds,
    warmRecentMessageDetails,
  } = context
  const messagesLoading = currentMessageListWindowPage?.loading ?? true
  const moreLoading = messageListWindowPages.some((page) => page.loading)
  const { mutateAsync: mutateMessageFlags } = useMutation({
    mutationKey: ["mail", "update-message-flags"],
    mutationFn: ({
      clientMutationId,
      flags,
      messageId,
    }: {
      clientMutationId: string
      flags: {
        flagged?: boolean
        seen?: boolean
      }
      messageId: string
    }) =>
      apiFetch<{ message: MessageDto }>(`/api/mail/messages/${messageId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...flags,
          clientMutationId,
        }),
      }),
  })
  const baseMutateMessageFlagsBatch = useConvexMutation(
    api.mail.updateMessageFlagsBatch
  )
  const mutateMessageFlagsBatch = React.useMemo(
    () =>
      baseMutateMessageFlagsBatch.withOptimisticUpdate(
        (localStore, { updates }) => {
          const updatesById = new Map(
            updates.map((update) => [update.messagePublicId, update])
          )

          for (const queryResult of localStore.getAllQueries(
            api.mail.listMessages
          )) {
            if (!queryResult.value) continue

            const page = queryResult.value.page.flatMap((message) => {
              const update = updatesById.get(message.id)
              const nextMessage = update
                ? {
                    ...message,
                    ...(update.seen === undefined ? {} : { seen: update.seen }),
                    ...(update.flagged === undefined
                      ? {}
                      : { flagged: update.flagged }),
                  }
                : message

              if (
                (queryResult.args.unread && nextMessage.seen) ||
                (queryResult.args.flagged && !nextMessage.flagged)
              ) {
                return []
              }

              return [nextMessage]
            })

            localStore.setQuery(api.mail.listMessages, queryResult.args, {
              ...queryResult.value,
              page,
            })
          }
        }
      ),
    [baseMutateMessageFlagsBatch]
  )
  const sendMessageFlagMutations = React.useCallback(
    async (mutations: PendingMessageMutation[]) => {
      for (const batch of chunkItems(mutations, messageFlagsBatchSize)) {
        await mutateMessageFlagsBatch({
          updates: batch.map((mutation) => ({
            messagePublicId: mutation.messageId,
            clientMutationId: mutation.clientMutationId,
            ...mutation.flags,
          })),
        })
        await removePendingMessageMutations(batch)
      }
    },
    [mutateMessageFlagsBatch]
  )
  const applySynchronizedMessage = React.useCallback(
    (message: MessageDto) => {
      queryClient.setQueryData(queryKeys.messageDetail(message.id), {
        message,
      })
      queryClient.setQueriesData<MessageListCacheData>(
        {
          queryKey: queryKeys.messageLists(),
        },
        (data) => patchMessageListItemData(data, message.id, message)
      )
      setSelectedMessage((currentMessage) =>
        currentMessage?.id === message.id ? message : currentMessage
      )
      void queryClient.invalidateQueries({
        queryKey: queryKeys.messageThread(message.id),
      })
      persistOpenedMessage(message)
    },
    [persistOpenedMessage, queryClient]
  )
  const flushPendingMessageMutationsRef = React.useRef<() => Promise<void>>(
    async () => undefined
  )
  const flushPendingMessageMutations = React.useCallback(async () => {
    if (isNetworkOffline()) {
      return
    }

    if (pendingMessageSyncRetryRef.current !== null) {
      window.clearTimeout(pendingMessageSyncRetryRef.current)
      pendingMessageSyncRetryRef.current = null
    }

    if (pendingMessageSyncPromiseRef.current) {
      return pendingMessageSyncPromiseRef.current
    }

    const syncPromise = (async () => {
      const mutations = await listPendingMessageMutations()
      await sendMessageFlagMutations(mutations)

      if (mutations.length > 0) {
        invalidateCachedQueries(
          queryClient,
          (queryKey) => queryKey[0] === "mail" && queryKey[1] === "messages"
        )
      }
    })().finally(() => {
      pendingMessageSyncPromiseRef.current = null
      if (!isNetworkOffline()) {
        void listPendingMessageMutations().then((mutations) => {
          if (
            mutations.length > 0 &&
            pendingMessageSyncRetryRef.current === null
          ) {
            pendingMessageSyncRetryRef.current = window.setTimeout(() => {
              pendingMessageSyncRetryRef.current = null
              void flushPendingMessageMutationsRef.current().catch((error) => {
                handleBackgroundRequestError(error, setAuthStatus)
              })
            }, 5_000)
          }
        })
      }
    })

    pendingMessageSyncPromiseRef.current = syncPromise
    return syncPromise
  }, [queryClient, sendMessageFlagMutations])
  React.useEffect(() => {
    flushPendingMessageMutationsRef.current = flushPendingMessageMutations
  }, [flushPendingMessageMutations])
  const moveMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      targetPath,
    }: {
      messageId: string
      targetPath: string
    }) => moveMessage(messageId, targetPath),
  })
  const checkedMessages = React.useMemo(
    () => messages.filter((message) => selectedMessageIds.has(message.id)),
    [messages, selectedMessageIds]
  )
  const selectedMessageCount = checkedMessages.length
  const allMessagesSelected =
    messages.length > 0 &&
    messages.every((message) => selectedMessageIds.has(message.id))
  const selectedUnreadCount = checkedMessages.filter(
    (message) => !message.seen
  ).length
  const unreadMessageCount = messages.filter((message) => !message.seen).length
  const appUnreadCount = React.useMemo(
    () => sumSpecialMailboxUnreadCount(accounts, mailboxesByAccount, "\\Inbox"),
    [accounts, mailboxesByAccount]
  )
  const badgeUpdateVersionRef = React.useRef(0)
  const applyAppBadge = useEvent((unreadCount: number) => {
    badgeUpdateVersionRef.current += 1

    const badgeUpdate =
      unreadCount > 0
        ? navigator.setAppBadge(unreadCount)
        : navigator.clearAppBadge()

    void badgeUpdate.catch(() => undefined)
  })
  const applyCurrentAppBadge = useEvent(() => {
    applyAppBadge(
      authStatus === "authenticated" ? Math.max(0, appUnreadCount) : 0
    )
  })
  const allSelectedFlagged =
    checkedMessages.length > 0 &&
    checkedMessages.every((message) => message.flagged)
  const activeMessageThread = messageThread?.messages.some(
    (message) => message.id === selectedMessageId
  )
    ? messageThread
    : null
  React.useEffect(() => {
    if (
      authStatus === "checking" ||
      !("setAppBadge" in navigator) ||
      !("clearAppBadge" in navigator)
    ) {
      return
    }

    applyCurrentAppBadge()
  }, [appUnreadCount, applyCurrentAppBadge, authStatus])
  React.useEffect(() => {
    if (
      authStatus !== "authenticated" ||
      !networkOnline ||
      !("setAppBadge" in navigator) ||
      !("clearAppBadge" in navigator)
    ) {
      return
    }

    let active = true

    async function reconcileAppBadge() {
      const updateVersion = badgeUpdateVersionRef.current

      try {
        const { unreadCount } = await apiFetch<{ unreadCount: number }>(
          "/api/push/badge"
        )

        if (
          active &&
          updateVersion === badgeUpdateVersionRef.current &&
          Number.isInteger(unreadCount) &&
          unreadCount >= 0
        ) {
          applyAppBadge(unreadCount)
        }
      } catch {
        return
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void reconcileAppBadge()
      }
    }

    function handleServiceWorkerMessage(event: MessageEvent) {
      if (
        document.visibilityState === "visible" &&
        isPwaMessageOfType(event.data, "mail:new")
      ) {
        applyCurrentAppBadge()
      }
    }

    void reconcileAppBadge()
    document.addEventListener("visibilitychange", handleVisibilityChange)
    navigator.serviceWorker?.addEventListener(
      "message",
      handleServiceWorkerMessage
    )

    return () => {
      active = false
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      navigator.serviceWorker?.removeEventListener(
        "message",
        handleServiceWorkerMessage
      )
    }
  }, [applyAppBadge, applyCurrentAppBadge, authStatus, networkOnline])
  const openedMessage =
    activeSelectedMessage ??
    messages.find((message) => message.id === selectedMessageId) ??
    activeMessageThread?.messages.find(
      (message) => message.id === selectedMessageId
    ) ??
    null
  const offlineStatusActive =
    offlineModeActive ||
    !networkOnline ||
    Boolean(currentMessageListWindowPage?.data?.offline)
  React.useEffect(() => {
    if (!firstMailDataMarkedRef.current && messages.length > 0) {
      firstMailDataMarkedRef.current = true
      markPerformance("first-mail-data-ready")
      measurePerformance(
        "boot-to-first-mail-data",
        "app-boot",
        "first-mail-data-ready"
      )
    }
  }, [messages.length])
  React.useEffect(() => {
    setSelectedMessageIds((currentMessageIds) => {
      if (currentMessageIds.size === 0) {
        return currentMessageIds
      }

      const visibleMessageIds = new Set(messages.map((message) => message.id))
      const nextMessageIds = new Set(
        [...currentMessageIds].filter((messageId) =>
          visibleMessageIds.has(messageId)
        )
      )

      return nextMessageIds.size === currentMessageIds.size
        ? currentMessageIds
        : nextMessageIds
    })
  }, [messages])
  React.useEffect(() => {
    if (authStatus === "authenticated" && refreshKey > 0) {
      void refetchMessageList()
    }
  }, [authStatus, refetchMessageList, refreshKey])
  React.useEffect(() => {
    offlineCacheSettingsRef.current = offlineCacheSettings

    if (
      !offlineCacheSettings.enabled ||
      offlineCacheSettings.messageMode !== "recent-and-opened"
    ) {
      offlineWarmMessageAbortRef.current?.abort()
      offlineWarmMessageQueueRef.current.length = 0
      offlineWarmMessageIdsRef.current.clear()
      return
    }

    warmRecentMessageDetails(offlineWarmVisibleMessagesRef.current)
  }, [offlineCacheSettings, warmRecentMessageDetails])
  React.useEffect(() => {
    const handleNetworkChange = () => {
      setNetworkOnline(getCurrentNetworkOnline())

      if (isNetworkOffline()) {
        offlineWarmMessageAbortRef.current?.abort()
        return
      }

      warmRecentMessageDetails(offlineWarmVisibleMessagesRef.current)
    }

    window.addEventListener("online", handleNetworkChange)
    window.addEventListener("offline", handleNetworkChange)

    return () => {
      window.removeEventListener("online", handleNetworkChange)
      window.removeEventListener("offline", handleNetworkChange)
      if (pendingMessageSyncRetryRef.current !== null) {
        window.clearTimeout(pendingMessageSyncRetryRef.current)
      }
    }
  }, [warmRecentMessageDetails])
  React.useEffect(() => {
    let active = true

    async function refreshStatus() {
      const settings = offlineCacheSettingsRef.current

      try {
        await pruneOfflineMailCache(settings)
        const status = await getOfflineMailCacheStatus(settings)

        if (active) {
          setOfflineCacheStatus(status)
        }
      } catch {
        if (active) {
          setOfflineCacheStatus(null)
        }
      }
    }

    void refreshStatus()

    return () => {
      active = false
    }
  }, [offlineCacheSettings])
  React.useEffect(() => {
    setSelectedMessageIds(new Set())
  }, [messageListScopeKey])
  React.useEffect(() => {
    setSearchInput(searchQuery)
  }, [searchQuery])

  return {
    activeMessageThread,
    allMessagesSelected,
    allSelectedFlagged,
    appUnreadCount,
    applySynchronizedMessage,
    baseMutateMessageFlagsBatch,
    checkedMessages,
    flushPendingMessageMutations,
    flushPendingMessageMutationsRef,
    messagesLoading,
    moreLoading,
    moveMessageMutation,
    mutateMessageFlags,
    mutateMessageFlagsBatch,
    offlineStatusActive,
    openedMessage,
    selectedMessageCount,
    selectedUnreadCount,
    sendMessageFlagMutations,
    unreadMessageCount,
  }
}

export type MailMutationsContext = MailRealtimeContext &
  ReturnType<typeof useMailMutations>
