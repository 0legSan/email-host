/* eslint-disable react-hooks/exhaustive-deps -- composed controller contexts expose stable React setters and refs that the rule cannot infer. */
import * as React from "react"
import { useQueries as useTanStackQueries } from "@tanstack/react-query"
import { closeMailNotifications } from "@workspace/pwa/client"
import {
  messageListGcTimeMs,
  messageListStaleTimeMs,
  readApiRequestTimeoutMs,
  realtimeMessageListFallbackDelayMs,
  type ConvexMessageListPage,
  type MessageListCacheData,
  type MessageListWindowPage,
  type RealtimeMessageState,
} from "@/features/mail/controller/mail-controller-config"
import {
  loadKnownContacts,
  saveKnownContacts,
} from "@/features/mail/controller/mail-controller-storage"
import type { VisibleMessageListPosition } from "@/features/mail/message-list/message-list-types"
import { useEvent } from "@/features/mail/message-list/use-pull-to-refresh"
import {
  fetchMessagesPage,
  type MailContactDto,
  type MessageDto,
  type MessagePageDto,
  type MessagePageRequest,
  type MessageListItemDto,
  type MessageThreadDto,
} from "@/lib/api-client"
import { queryKeys } from "@/lib/query-keys"
import { isOfflineMailCursor } from "@/lib/offline-mail-query"
import {
  applyPendingMessageMutationsToPage,
  readCachedMessageList,
  synchronizeCachedMessageStates,
} from "@/lib/offline-mail-cache"
import {
  createEmptyMessagePage,
  handleBackgroundRequestError,
  isAbortError,
  isNetworkOffline,
  mergeRealtimeMessage,
  patchMessageListItemData,
  patchMessageListStatesData,
  patchMessageThreadWithRealtimeStates,
  patchMessageWithRealtimeState,
} from "./mail-controller-helpers"
import type { MailQueriesContext } from "./use-mail-queries"
import { selectConsistentMessageListPages } from "./message-list-window"

export function useMailRealtime(context: MailQueriesContext) {
  const {
    convexQueryEnabled,
    currentMessageListPage,
    currentMessagePageRequest,
    currentUserId,
    messageListQueryEnabled,
    messageListScopeKey,
    offlineCacheSettings,
    offlineCacheSettingsRef,
    offlineWarmMessageAbortRef,
    offlineWarmMessageIdsRef,
    offlineWarmMessagePromiseRef,
    offlineWarmMessageQueueRef,
    offlineWarmVisibleMessagesRef,
    persistCachedBootstrapPatch,
    persistMessageList,
    persistMessageThread,
    persistOpenedMessage,
    persistedMessageListPageSourcesRef,
    queryClient,
    reactiveAccounts,
    reactiveKnownContacts,
    reactiveMailboxes,
    reactiveMessageListPages,
    reactiveMessageStates,
    reactiveSelectedMessage,
    reactiveSelectedThread,
    requestedMessageListPage,
    requestedMessageListPages,
    scheduleMessageListPositionPersistence,
    selectedMessageId,
    setAccounts,
    setAuthStatus,
    setKnownContacts,
    setMailboxesByAccount,
    setMessageListNavigation,
    setMessageThread,
    setOfflineModeActive,
    setRequestedMessageListPage,
    setSelectedMessage,
    visibleMessageListPositionRef,
    warmRecentMessageDetails,
  } = context
  const convexMessageListReady =
    !convexQueryEnabled ||
    requestedMessageListPages.every(
      ({ pageNumber, cursor }) =>
        isOfflineMailCursor(cursor) ||
        reactiveMessageListPages[String(pageNumber)] !== undefined
    )
  const [convexFallbackScopeKey, setConvexFallbackScopeKey] = React.useState<
    string | null
  >(null)
  const convexFallbackActive =
    convexQueryEnabled &&
    !convexMessageListReady &&
    convexFallbackScopeKey === messageListScopeKey
  React.useEffect(() => {
    if (!convexQueryEnabled || convexMessageListReady) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setConvexFallbackScopeKey(messageListScopeKey)
    }, realtimeMessageListFallbackDelayMs)

    return () => window.clearTimeout(timeoutId)
  }, [convexMessageListReady, convexQueryEnabled, messageListScopeKey])
  React.useEffect(() => {
    if (!currentUserId) {
      setKnownContacts([])
      return
    }

    setKnownContacts(loadKnownContacts(currentUserId))
  }, [currentUserId])
  React.useEffect(() => {
    if (!currentUserId || reactiveKnownContacts === undefined) {
      return
    }

    const nextContacts = reactiveKnownContacts as MailContactDto[]
    setKnownContacts(nextContacts)
    saveKnownContacts(currentUserId, nextContacts)
  }, [currentUserId, reactiveKnownContacts])
  const mergeLatestRealtimeSelectedMessage = useEvent((message: MessageDto) => {
    if (
      reactiveSelectedMessage === undefined ||
      reactiveSelectedMessage === null
    ) {
      return message
    }

    return mergeRealtimeMessage(message, reactiveSelectedMessage as MessageDto)
  })
  const localMessageListQueries = useTanStackQueries({
    queries: requestedMessageListPages.map(({ cursor }) => ({
      queryKey: [
        ...queryKeys.messageListPage({
          ...currentMessagePageRequest,
          cursor: cursor ?? undefined,
        }),
        "offline",
      ],
      enabled: messageListQueryEnabled && offlineCacheSettings.enabled,
      networkMode: "always" as const,
      gcTime: 2 * 60 * 1000,
      staleTime: 0,
      retry: false,
      refetchOnWindowFocus: true,
      queryFn: () =>
        readCachedMessageList(
          { ...currentMessagePageRequest, cursor: cursor ?? undefined },
          offlineCacheSettings
        ),
    })),
  })
  const fallbackMessageListQueries = useTanStackQueries({
    queries: requestedMessageListPages.map(({ cursor }) => {
      const messagePageRequest: MessagePageRequest = {
        ...currentMessagePageRequest,
        cursor: cursor ?? undefined,
      }

      return {
        enabled:
          messageListQueryEnabled &&
          (!convexQueryEnabled || convexFallbackActive) &&
          !isOfflineMailCursor(cursor),
        gcTime: messageListGcTimeMs,
        networkMode: "always" as const,
        queryKey: queryKeys.messageListPage(messagePageRequest),
        queryFn: async ({ signal }: { signal: AbortSignal }) => {
          try {
            if (isNetworkOffline()) {
              const offlinePage = await readCachedMessageList(
                messagePageRequest,
                offlineCacheSettingsRef.current
              )

              setOfflineModeActive(true)

              return (
                offlinePage ?? { ...createEmptyMessagePage(), offline: true }
              )
            }

            const serverPage = await fetchMessagesPage(messagePageRequest, {
              signal,
              timeoutMs: readApiRequestTimeoutMs,
            })
            const data = await applyPendingMessageMutationsToPage(serverPage)

            setOfflineModeActive(false)
            persistMessageList(messagePageRequest, data)
            warmRecentMessageDetails(data.messages)

            return data
          } catch (error) {
            if (isAbortError(error)) {
              throw error
            }

            const offlinePage = await readCachedMessageList(
              messagePageRequest,
              offlineCacheSettingsRef.current
            )

            if (offlinePage) {
              setOfflineModeActive(true)
              return offlinePage
            }

            handleBackgroundRequestError(error, setAuthStatus)
            throw error
          }
        },
        retry: false,
        staleTime: messageListStaleTimeMs,
      }
    }),
  })
  React.useEffect(() => {
    if (reactiveAccounts === undefined) return
    setAccounts(reactiveAccounts)
    queryClient.setQueryData(queryKeys.accounts(), {
      accounts: reactiveAccounts,
    })
  }, [queryClient, reactiveAccounts])
  React.useEffect(() => {
    if (reactiveMailboxes === undefined) return
    setMailboxesByAccount(reactiveMailboxes)
    for (const [accountId, mailboxes] of Object.entries(reactiveMailboxes)) {
      queryClient.setQueryData(queryKeys.mailboxes(accountId), { mailboxes })
    }
    persistCachedBootstrapPatch({
      mailboxesByAccount: reactiveMailboxes,
    })
  }, [persistCachedBootstrapPatch, queryClient, reactiveMailboxes])
  React.useEffect(() => {
    if (reactiveMessageStates === undefined) return

    const states = reactiveMessageStates as RealtimeMessageState[]
    const statesById = new Map(states.map((state) => [state.id, state]))

    void closeMailNotifications(
      states.filter((state) => state.seen).map((state) => state.id)
    )

    queryClient.setQueriesData<{ message: MessageDto }>(
      {
        queryKey: queryKeys.messageDetails(),
      },
      (data) => {
        if (!data) return data
        const message = patchMessageWithRealtimeState(data.message, statesById)
        return message === data.message ? data : { message }
      }
    )
    queryClient.setQueriesData<{ thread: MessageThreadDto }>(
      {
        queryKey: queryKeys.messageThreads(),
      },
      (data) => {
        if (!data) return data
        const thread = patchMessageThreadWithRealtimeStates(
          data.thread,
          statesById
        )
        return thread === data.thread ? data : { thread }
      }
    )
    queryClient.setQueriesData<MessageListCacheData>(
      {
        queryKey: queryKeys.messageLists(),
      },
      (data) => patchMessageListStatesData(data, states)
    )
    setSelectedMessage((current) =>
      current ? patchMessageWithRealtimeState(current, statesById) : current
    )
    setMessageThread((current) =>
      current
        ? patchMessageThreadWithRealtimeStates(current, statesById)
        : current
    )
    void synchronizeCachedMessageStates(
      states,
      offlineCacheSettingsRef.current
    ).catch(() => undefined)
  }, [queryClient, reactiveMessageStates])
  React.useEffect(() => {
    if (!selectedMessageId || reactiveSelectedMessage === undefined) return
    if (reactiveSelectedMessage === null) return

    const realtimeMessage = reactiveSelectedMessage as MessageDto
    const cachedMessage = queryClient.getQueryData<{ message: MessageDto }>(
      queryKeys.messageDetail(selectedMessageId)
    )?.message
    const message = mergeRealtimeMessage(cachedMessage, realtimeMessage)

    queryClient.setQueryData(queryKeys.messageDetail(selectedMessageId), {
      message,
    })
    queryClient.setQueriesData<MessageListCacheData>(
      {
        queryKey: queryKeys.messageLists(),
      },
      (data) =>
        patchMessageListItemData(data, selectedMessageId, {
          seen: realtimeMessage.seen,
          flagged: realtimeMessage.flagged,
        })
    )
    setSelectedMessage((current) =>
      mergeRealtimeMessage(current, realtimeMessage)
    )
    if (message.bodyStatus === "loaded") {
      persistOpenedMessage(message)
    }
    void synchronizeCachedMessageStates(
      [
        {
          id: realtimeMessage.id,
          seen: realtimeMessage.seen,
          flagged: realtimeMessage.flagged,
        },
      ],
      offlineCacheSettingsRef.current
    ).catch(() => undefined)
  }, [
    persistOpenedMessage,
    queryClient,
    reactiveSelectedMessage,
    selectedMessageId,
  ])
  React.useEffect(() => {
    if (!selectedMessageId || reactiveSelectedThread === undefined) return
    if (reactiveSelectedThread === null) return

    const thread = reactiveSelectedThread as MessageThreadDto
    queryClient.setQueryData(queryKeys.messageThread(selectedMessageId), {
      thread,
    })
    setMessageThread(thread)
    persistMessageThread(selectedMessageId, thread)
  }, [
    persistMessageThread,
    queryClient,
    reactiveSelectedThread,
    selectedMessageId,
  ])
  const convexMessageListError = convexQueryEnabled
    ? Object.values(reactiveMessageListPages).find(
        (result): result is Error => result instanceof Error
      )
    : undefined
  if (convexMessageListError) {
    throw convexMessageListError
  }
  const messageListWindowPages = React.useMemo<MessageListWindowPage[]>(
    () =>
      selectConsistentMessageListPages(
        requestedMessageListPages.map(({ cursor, pageNumber }, index) => {
          const localData = localMessageListQueries[index]?.data ?? null
          const fallbackData = fallbackMessageListQueries[index]?.data ?? null
          const cachedData = fallbackData?.offline
            ? (localData ?? fallbackData)
            : (fallbackData ?? localData)
          if (convexQueryEnabled && !isOfflineMailCursor(cursor)) {
            const result = reactiveMessageListPages[String(pageNumber)] as
              ConvexMessageListPage | undefined
            return {
              pageNumber,
              cursor,
              data: result
                ? {
                    messages: result.page,
                    nextPageCursor: result.isDone
                      ? null
                      : result.continueCursor,
                    total: null,
                  }
                : cachedData,
              loading: result === undefined && !cachedData,
              source: result ?? cachedData,
            }
          }

          const query = fallbackMessageListQueries[index]

          return {
            pageNumber,
            cursor,
            data: cachedData,
            loading:
              !cachedData &&
              (query?.isLoading ||
                localMessageListQueries[index]?.isLoading ||
                false),
            source: cachedData,
          }
        })
      ),
    [
      convexQueryEnabled,
      fallbackMessageListQueries,
      localMessageListQueries,
      reactiveMessageListPages,
      requestedMessageListPages,
    ]
  )
  const firstWindowPage = messageListWindowPages.find(
    (page) => page.pageNumber === 1
  )
  React.useEffect(() => {
    if (!firstWindowPage?.data || currentMessageListPage === 1) return
    const currentPage = requestedMessageListPages.find(
      (page) => page.pageNumber === currentMessageListPage
    )
    if (
      isOfflineMailCursor(currentPage?.cursor) ===
      Boolean(firstWindowPage.data.offline)
    )
      return
    // A position from the previous source has no meaning in the new result set.
    setMessageListNavigation((current) =>
      current.scopeKey === messageListScopeKey
        ? {
            ...current,
            currentPage: 1,
            cursors: { "1": null },
            restoredPosition: null,
          }
        : current
    )
  }, [
    currentMessageListPage,
    firstWindowPage?.data?.offline,
    Boolean(firstWindowPage?.data),
    messageListScopeKey,
    requestedMessageListPages,
  ])
  const lastMessageListPage = React.useMemo(
    () =>
      messageListWindowPages.find(
        (page) => page.data && page.data.nextPageCursor === null
      )?.pageNumber ?? null,
    [messageListWindowPages]
  )
  React.useEffect(() => {
    if (
      requestedMessageListPage !== null &&
      lastMessageListPage !== null &&
      requestedMessageListPage > lastMessageListPage
    ) {
      setRequestedMessageListPage(null)
    }
  }, [lastMessageListPage, requestedMessageListPage])
  const messageListCursorSignature = messageListWindowPages
    .map(
      (page) =>
        `${page.pageNumber}:${page.data?.nextPageCursor ?? (page.data ? "done" : "loading")}`
    )
    .join("|")
  const synchronizeMessageListCursors = useEvent(() => {
    setMessageListNavigation((current) => {
      if (current.scopeKey !== messageListScopeKey) {
        return current
      }

      const cursors = { ...current.cursors }
      let changed = false

      for (const page of messageListWindowPages) {
        if (!page.data?.nextPageCursor) {
          continue
        }

        const nextPageKey = String(page.pageNumber + 1)

        if (cursors[nextPageKey] !== page.data.nextPageCursor) {
          cursors[nextPageKey] = page.data.nextPageCursor
          changed = true
        }
      }

      return changed ? { ...current, cursors } : current
    })
  })
  React.useEffect(() => {
    synchronizeMessageListCursors()
  }, [messageListCursorSignature, synchronizeMessageListCursors])
  const refetchMessageList = useEvent(() => {
    return Promise.all(
      [
        ...localMessageListQueries,
        ...fallbackMessageListQueries.filter(
          (_, index) =>
            !isOfflineMailCursor(requestedMessageListPages[index]?.cursor)
        ),
      ].map((query) => query.refetch())
    )
  })
  React.useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void refetchMessageList()
    }
    window.addEventListener("online", refresh)
    window.addEventListener("pageshow", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.removeEventListener("online", refresh)
      window.removeEventListener("pageshow", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [refetchMessageList])
  const realtimeMessageStates = React.useMemo(
    () =>
      new Map(
        ((reactiveMessageStates ?? []) as RealtimeMessageState[]).map(
          (state) => [state.id, state]
        )
      ),
    [reactiveMessageStates]
  )
  const { messageListPageNumbers, messages } = React.useMemo(() => {
    const seenMessageIds = new Set<string>()
    const nextMessages: MessageListItemDto[] = []
    const nextPageNumbers: number[] = []

    for (const page of messageListWindowPages) {
      for (const message of page.data?.messages ?? []) {
        if (seenMessageIds.has(message.id)) {
          continue
        }

        seenMessageIds.add(message.id)
        const state = page.data?.offline
          ? undefined
          : realtimeMessageStates.get(message.id)
        if (
          page.data?.offline &&
          ((currentMessagePageRequest.unread &&
            (state?.seen ?? message.seen)) ||
            (currentMessagePageRequest.flagged &&
              !(state?.flagged ?? message.flagged)))
        )
          continue
        nextMessages.push(
          state &&
            (state.seen !== message.seen || state.flagged !== message.flagged)
            ? {
                ...message,
                seen: state.seen,
                flagged: state.flagged,
              }
            : message
        )
        nextPageNumbers.push(page.pageNumber)
      }
    }

    return {
      messageListPageNumbers: nextPageNumbers,
      messages: nextMessages,
    }
  }, [
    messageListWindowPages,
    realtimeMessageStates,
    currentMessagePageRequest.unread,
    currentMessagePageRequest.flagged,
  ])
  React.useEffect(() => {
    offlineWarmVisibleMessagesRef.current = messages
  }, [messages, offlineWarmVisibleMessagesRef])
  const currentMessageListWindowPage = messageListWindowPages.find(
    (page) => page.pageNumber === currentMessageListPage
  )
  const previousMessageListWindowPage = messageListWindowPages.find(
    (page) => page.pageNumber === currentMessageListPage - 1
  )
  const nextMessageListWindowPage = messageListWindowPages.find(
    (page) => page.pageNumber === currentMessageListPage + 1
  )
  const canGoToPreviousMessageListPage = Boolean(
    currentMessageListPage > 1 && previousMessageListWindowPage?.data
  )
  const canGoToNextMessageListPage = Boolean(nextMessageListWindowPage?.data)
  const handleMessageListPageChange = useEvent((page: number) => {
    setMessageListNavigation((current) =>
      current.scopeKey === messageListScopeKey && current.currentPage !== page
        ? { ...current, currentPage: page }
        : current
    )
    visibleMessageListPositionRef.current = {
      ...visibleMessageListPositionRef.current,
      page,
    }
    scheduleMessageListPositionPersistence()
  })
  const handleMessageListPageRequest = useEvent((page: number | null) => {
    setRequestedMessageListPage(page)
  })
  const handleVisibleMessageListPositionChange = useEvent(
    (position: VisibleMessageListPosition) => {
      visibleMessageListPositionRef.current = position
      setMessageListNavigation((current) =>
        current.scopeKey === messageListScopeKey &&
        current.currentPage !== position.page
          ? { ...current, currentPage: position.page }
          : current
      )
      scheduleMessageListPositionPersistence()
    }
  )
  React.useEffect(() => {
    if (!convexQueryEnabled) return
    const activePageKeys = new Set<string>()
    const changedPages: Array<
      MessageListWindowPage & { data: MessagePageDto }
    > = []

    for (const page of messageListWindowPages) {
      if (!page.data || page.data.offline || !page.source) {
        continue
      }

      const pageKey = `${messageListScopeKey}:${page.pageNumber}:${page.cursor ?? "first"}`
      activePageKeys.add(pageKey)

      if (
        persistedMessageListPageSourcesRef.current.get(pageKey) !== page.source
      ) {
        persistedMessageListPageSourcesRef.current.set(pageKey, page.source)
        changedPages.push({ ...page, data: page.data })
      }
    }

    for (const pageKey of persistedMessageListPageSourcesRef.current.keys()) {
      if (!activePageKeys.has(pageKey)) {
        persistedMessageListPageSourcesRef.current.delete(pageKey)
      }
    }

    if (changedPages.length === 0) {
      return
    }
    setOfflineModeActive(false)

    const messageStates = messages.map(({ id, seen, flagged }) => ({
      id,
      seen,
      flagged,
    }))

    queryClient.setQueriesData<MessageListCacheData>(
      {
        queryKey: queryKeys.messageLists(),
      },
      (data) => patchMessageListStatesData(data, messageStates)
    )
    for (const page of changedPages) {
      persistMessageList(
        {
          ...currentMessagePageRequest,
          cursor: page.cursor ?? undefined,
        },
        page.data
      )
    }
    void synchronizeCachedMessageStates(
      messageStates,
      offlineCacheSettingsRef.current
    ).catch(() => undefined)
    warmRecentMessageDetails(messages)
  }, [
    currentMessagePageRequest,
    convexQueryEnabled,
    messageListScopeKey,
    messageListWindowPages,
    messages,
    persistMessageList,
    queryClient,
    warmRecentMessageDetails,
  ])
  React.useEffect(() => {
    const messageQueue = offlineWarmMessageQueueRef.current
    const scheduledMessageIds = offlineWarmMessageIdsRef.current
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        offlineWarmMessageAbortRef.current?.abort()
        return
      }

      const activeWarm = offlineWarmMessagePromiseRef.current

      if (activeWarm) {
        void activeWarm.finally(() => {
          if (document.visibilityState === "visible") {
            warmRecentMessageDetails(offlineWarmVisibleMessagesRef.current)
          }
        })
        return
      }

      warmRecentMessageDetails(offlineWarmVisibleMessagesRef.current)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      offlineWarmMessageAbortRef.current?.abort()
      messageQueue.length = 0
      scheduledMessageIds.clear()
    }
  }, [warmRecentMessageDetails])

  return {
    canGoToNextMessageListPage,
    canGoToPreviousMessageListPage,
    convexMessageListError,
    currentMessageListWindowPage,
    fallbackMessageListQueries,
    handleMessageListPageChange,
    handleMessageListPageRequest,
    handleVisibleMessageListPositionChange,
    lastMessageListPage,
    mergeLatestRealtimeSelectedMessage,
    messageListCursorSignature,
    messageListPageNumbers,
    messageListWindowPages,
    messages,
    nextMessageListWindowPage,
    previousMessageListWindowPage,
    realtimeMessageStates,
    refetchMessageList,
    synchronizeMessageListCursors,
  }
}

export type MailRealtimeContext = MailQueriesContext &
  ReturnType<typeof useMailRealtime>
