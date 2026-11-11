import { useMailLocale } from "@workspace/mail-design"
/* eslint-disable react-hooks/exhaustive-deps -- composed controller contexts expose stable React setters and refs that the rule cannot infer. */
import * as React from "react"
import { isPwaMessageOfType } from "@workspace/pwa/client"
import { checkForPwaUpdate } from "@workspace/pwa/react"
import {
  preloadComposePanel,
  preloadSettingsPanel,
} from "@/features/mail/lazy-mail-panels"
import {
  initialMessagePageRequest,
  readApiRequestTimeoutMs,
  startupBootstrapTimeoutMs,
  type MessageListInfiniteData,
} from "@/features/mail/controller/mail-controller-config"
import { clearStoredComposeDraft } from "@/features/mail/controller/mail-controller-storage"
import { useEvent } from "@/features/mail/message-list/use-pull-to-refresh"
import {
  apiFetch,
  fetchMessageThread,
  fetchBootstrap,
  type MailboxDto,
  type MessageDto,
  type MessageThreadDto,
} from "@/lib/api-client"
import { markPerformance, measurePerformance } from "@/lib/performance"
import { webPushClient } from "@/lib/pwa"
import { queryKeys } from "@/lib/query-keys"
import {
  applyPendingMessageMutationsToBootstrap,
  applyPendingMessageMutationsToMailboxes,
  applyPendingMessageMutationsToMessage,
  applyPendingMessageMutationsToThread,
  readCachedMessageDetail,
  readCachedMessageThread,
} from "@/lib/offline-mail-cache"
import {
  fetchCachedQuery,
  getErrorMessage,
  handleBackgroundRequestError,
  handleRequestError,
  hasOpenEditorUiOverlay,
  isApplicationAuthError,
  isCloseWindowShortcut,
  isEditorUiEscapeTarget,
  isNetworkOffline,
  preserveNewerInitialMessagePage,
} from "./mail-controller-helpers"
import type { MailUiActionsContext } from "./use-mail-ui-actions"

export function useMailEffects(context: MailUiActionsContext) {
  const { t } = useMailLocale()

  const {
    accounts,
    applyBootstrapData,
    authStatus,
    closeOpenedMessage,
    composeOpen,
    flushPendingMessageMutations,
    invalidateMessageCaches,
    loadAccounts,
    loadProfiles,
    mergeLatestRealtimeSelectedMessage,
    messageIframeRef,
    messageIframeResizeCleanupRef,
    messageWidthMode,
    mobileSidebarOpen,
    navigateToMailList,
    networkOnline,
    observeMessageIframeSize,
    offlineCacheSettingsRef,
    persistBootstrap,
    persistCachedBootstrapPatch,
    persistMessageThread,
    persistOpenedMessage,
    profiles,
    queryClient,
    refreshKey,
    restoreBootstrapFromOfflineCache,
    searchInput,
    searchQuery,
    selectedAccountId,
    selectedMailboxPath,
    selectedMessageBackgroundColor,
    selectedMessageHtmlDocument,
    selectedMessageId,
    selectedProfileId,
    setAuthStatus,
    setComposeDraftValues,
    setComposeInitialValues,
    setErrorMessage,
    setIsDarkTheme,
    setMailboxesByAccount,
    setMailboxesLoading,
    setMessageIframeHeight,
    setMessageLoading,
    setMessageThread,
    setOfflineModeActive,
    setPushState,
    setRefreshKey,
    setSelectedMessage,
    setSettledMessageId,
    settingsOpen,
    updateCurrentRouteSearch,
    warmRecentMessageDetails,
  } = context
  const observeMessageIframeSizeEvent = useEvent(observeMessageIframeSize)
  React.useLayoutEffect(() => {
    messageIframeResizeCleanupRef.current?.()
    messageIframeResizeCleanupRef.current = null
    setMessageIframeHeight(560)

    const iframe = messageIframeRef.current
    if (selectedMessageHtmlDocument && iframe) {
      observeMessageIframeSizeEvent(iframe)
    }

    return () => {
      messageIframeResizeCleanupRef.current?.()
      messageIframeResizeCleanupRef.current = null
    }
  }, [observeMessageIframeSizeEvent, selectedMessageHtmlDocument])
  const messageViewportStyle = selectedMessageBackgroundColor
    ? ({
        backgroundColor: selectedMessageBackgroundColor,
      } satisfies React.CSSProperties)
    : undefined
  const messageContainerStyle = selectedMessageBackgroundColor
    ? ({
        backgroundColor: selectedMessageBackgroundColor,
      } satisfies React.CSSProperties)
    : undefined
  const messageContainerClassName =
    messageWidthMode === "fixed"
      ? "mx-auto min-h-full w-[960px] max-w-full border-x border-[#d8dee5] bg-white dark:border-[#30353a] dark:bg-[#15191d]"
      : "min-h-full w-full bg-white dark:bg-[#15191d]"
  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextQuery = searchInput.trim()

      if (nextQuery !== searchQuery) {
        updateCurrentRouteSearch(
          {
            q: nextQuery || null,
          },
          true
        )
      }
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [searchInput, searchQuery, updateCurrentRouteSearch])
  React.useEffect(() => {
    let active = true

    async function loadSession() {
      let restored = false

      try {
        const offline = isNetworkOffline()

        restored = await restoreBootstrapFromOfflineCache(
          offline ? "offline" : "cache"
        )

        if (!active) {
          return
        }

        if (offline) {
          if (restored) {
            return
          }

          setErrorMessage(
            t(
              "Нет подключения и локальный кеш недоступен",
              "No connection and the local cache is unavailable"
            )
          )
          setAuthStatus("anonymous")
          return
        }

        const initialMessagesQueryKey = queryKeys.messageList(
          initialMessagePageRequest
        )
        const initialMessageList =
          queryClient.getQueryData<MessageListInfiniteData>(
            initialMessagesQueryKey
          )
        const serverData = await fetchCachedQuery(
          queryClient,
          queryKeys.bootstrap(),
          () => fetchBootstrap({ timeoutMs: startupBootstrapTimeoutMs }),
          {
            force: true,
            retry: false,
            staleTimeMs: 30 * 1000,
          }
        )

        if (!active) {
          return
        }

        const currentData = preserveNewerInitialMessagePage(
          queryClient,
          serverData,
          initialMessageList
        )
        const data = await applyPendingMessageMutationsToBootstrap(currentData)

        applyBootstrapData(data, "network")
        persistBootstrap(data)
        warmRecentMessageDetails(data.initialMessages.page.messages)
      } catch (error) {
        if (!active) {
          return
        }

        if (isApplicationAuthError(error)) {
          markPerformance("auth-resolved")
          measurePerformance("boot-to-auth", "app-boot", "auth-resolved")
          setAuthStatus("anonymous")
          return
        }

        if (restored) {
          await restoreBootstrapFromOfflineCache("offline")
          return
        }

        if (await restoreBootstrapFromOfflineCache("offline")) {
          return
        }

        setErrorMessage(getErrorMessage(error))
        setAuthStatus("anonymous")
      }
    }

    void loadSession()

    return () => {
      active = false
    }
  }, [
    applyBootstrapData,
    persistBootstrap,
    queryClient,
    restoreBootstrapFromOfflineCache,
    warmRecentMessageDetails,
  ])
  React.useEffect(() => {
    if (authStatus === "authenticated" && networkOnline) {
      void flushPendingMessageMutations().catch((error) => {
        handleBackgroundRequestError(error, setAuthStatus)
      })
      void loadAccounts()
      void loadProfiles()
    }
  }, [
    authStatus,
    flushPendingMessageMutations,
    loadAccounts,
    loadProfiles,
    networkOnline,
  ])
  React.useEffect(() => {
    if (authStatus !== "authenticated") {
      return
    }

    const timeoutId = window.setTimeout(() => {
      preloadSettingsPanel()
      preloadComposePanel()
    }, 1500)

    return () => window.clearTimeout(timeoutId)
  }, [authStatus])
  React.useEffect(() => {
    if (
      selectedProfileId &&
      !profiles.some((profile) => profile.id === selectedProfileId)
    ) {
      navigateToMailList(
        {
          profileId: null,
        },
        true
      )
    }
  }, [navigateToMailList, profiles, selectedProfileId])
  React.useEffect(() => {
    if (authStatus !== "authenticated") {
      return
    }

    if (!networkOnline) {
      return
    }

    let active = true

    async function loadPushState() {
      const nextPushState = await fetchCachedQuery(
        queryClient,
        queryKeys.pushState(),
        webPushClient.getSyncedState,
        {
          staleTimeMs: 10 * 1000,
        }
      )

      if (active) {
        setPushState(nextPushState)
      }
    }

    const timeoutId = window.setTimeout(() => void loadPushState(), 1000)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [authStatus, networkOnline, queryClient])
  React.useEffect(() => {
    const updateTheme = () => {
      setIsDarkTheme(document.documentElement.classList.contains("dark"))
    }

    updateTheme()

    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })

    return () => observer.disconnect()
  }, [])
  React.useEffect(() => {
    if (accounts.length === 0) {
      setMailboxesByAccount({})
      return
    }

    if (!networkOnline) {
      setOfflineModeActive(true)
      setMailboxesLoading(false)
      return
    }

    let active = true

    async function loadMailboxes() {
      setMailboxesLoading(true)
      setErrorMessage(null)

      try {
        const entries = await Promise.all(
          accounts.map(async (account) => {
            const data = await fetchCachedQuery(
              queryClient,
              queryKeys.mailboxes(account.id),
              () =>
                apiFetch<{ mailboxes: MailboxDto[] }>(
                  `/api/mail/accounts/${account.id}/mailboxes`,
                  {
                    timeoutMs: readApiRequestTimeoutMs,
                  }
                ),
              {
                retry: false,
                staleTimeMs: 60 * 1000,
              }
            )
            const mailboxes = await applyPendingMessageMutationsToMailboxes(
              account.id,
              data.mailboxes
            )

            return [account.id, mailboxes] as const
          })
        )

        if (!active) {
          return
        }

        const nextMailboxesByAccount = Object.fromEntries(entries)
        const selectedMailboxes = selectedAccountId
          ? (nextMailboxesByAccount[selectedAccountId] ?? [])
          : []

        setMailboxesByAccount(nextMailboxesByAccount)
        persistCachedBootstrapPatch({
          mailboxesByAccount: nextMailboxesByAccount,
        })
        if (
          selectedAccountId &&
          selectedMailboxPath &&
          !selectedMailboxes.some(
            (mailbox) => mailbox.path === selectedMailboxPath
          )
        ) {
          navigateToMailList(
            {
              path: null,
            },
            true
          )
        }
      } catch (error) {
        if (active) {
          handleBackgroundRequestError(error, setAuthStatus)
        }
      } finally {
        if (active) {
          setMailboxesLoading(false)
        }
      }
    }

    void loadMailboxes()

    return () => {
      active = false
    }
  }, [
    accounts,
    navigateToMailList,
    networkOnline,
    persistCachedBootstrapPatch,
    queryClient,
    refreshKey,
    selectedAccountId,
    selectedMailboxPath,
  ])
  React.useEffect(() => {
    if (!selectedMessageId) {
      setSelectedMessage(null)
      setSettledMessageId(null)
      return
    }

    let active = true
    const messageId = selectedMessageId

    async function loadMessage() {
      setMessageLoading(true)
      setErrorMessage(null)

      let cachedMessage: MessageDto | null = null

      try {
        const cachedData = queryClient.getQueryData<{ message: MessageDto }>(
          queryKeys.messageDetail(messageId)
        )
        const storedMessage =
          cachedData?.message.bodyStatus === "loaded"
            ? cachedData.message
            : ((await readCachedMessageDetail(
                messageId,
                offlineCacheSettingsRef.current
              )) ?? cachedData?.message)
        cachedMessage = storedMessage
          ? mergeLatestRealtimeSelectedMessage(
              await applyPendingMessageMutationsToMessage(storedMessage)
            )
          : null

        if (!active) {
          return
        }

        if (cachedMessage) {
          setSelectedMessage(cachedMessage)
          setMessageLoading(false)
          setSettledMessageId(messageId)
          persistOpenedMessage(cachedMessage)
        } else {
          setSelectedMessage(null)
        }

        if (isNetworkOffline()) {
          setOfflineModeActive(true)
          if (!cachedMessage)
            setErrorMessage(
              t(
                "Содержимое письма не сохранено на устройстве. Загрузите его после подключения к серверу.",
                "Message content is not saved on this device. Load it after reconnecting to the server."
              )
            )
          return
        }

        const data = await fetchCachedQuery(
          queryClient,
          queryKeys.messageDetail(messageId),
          ({ signal }) =>
            apiFetch<{ message: MessageDto }>(
              `/api/mail/messages/${messageId}`,
              {
                signal,
                timeoutMs: readApiRequestTimeoutMs,
              }
            ),
          {
            force: Boolean(
              cachedMessage &&
              cachedMessage.bodyStatus !== "loaded" &&
              !cachedMessage.html &&
              !cachedMessage.text
            ),
            retry: false,
            staleTimeMs: 30 * 1000,
          }
        )

        const resolvedMessage = mergeLatestRealtimeSelectedMessage(
          await applyPendingMessageMutationsToMessage(data.message)
        )
        const bodyUnavailable =
          resolvedMessage.bodyStatus === "not_loaded" &&
          !resolvedMessage.html &&
          !resolvedMessage.text
        const message: MessageDto = bodyUnavailable
          ? { ...resolvedMessage, bodyStatus: "failed" }
          : resolvedMessage

        if (active) {
          queryClient.setQueryData(queryKeys.messageDetail(messageId), {
            message,
          })
          setSelectedMessage(message)
          setOfflineModeActive(false)
          if (bodyUnavailable) {
            setErrorMessage(
              t(
                "Не удалось загрузить содержимое письма",
                "Could not load message content"
              )
            )
          } else {
            persistOpenedMessage(message)
          }
        }
      } catch (error) {
        if (active) {
          if (cachedMessage) {
            if (
              cachedMessage.bodyStatus !== "loaded" &&
              !cachedMessage.html &&
              !cachedMessage.text
            ) {
              setSelectedMessage({ ...cachedMessage, bodyStatus: "failed" })
              setErrorMessage(getErrorMessage(error))
            }
            setOfflineModeActive(true)
            return
          }

          handleRequestError(error, setErrorMessage, setAuthStatus)
        }
      } finally {
        if (active) {
          setMessageLoading(false)
          setSettledMessageId(messageId)
        }
      }
    }

    void loadMessage()

    return () => {
      active = false
      void queryClient.cancelQueries({
        exact: true,
        queryKey: queryKeys.messageDetail(messageId),
      })
    }
  }, [
    mergeLatestRealtimeSelectedMessage,
    persistOpenedMessage,
    queryClient,
    selectedMessageId,
  ])
  React.useEffect(() => {
    if (!selectedMessageId) {
      setMessageThread(null)
      return
    }

    let active = true
    const messageId = selectedMessageId

    async function loadMessageThread() {
      setMessageThread((currentThread) =>
        currentThread?.messages.some((message) => message.id === messageId)
          ? currentThread
          : null
      )

      let cachedThread: MessageThreadDto | null = null

      try {
        const cachedData = queryClient.getQueryData<{
          thread: MessageThreadDto
        }>(queryKeys.messageThread(messageId))
        const storedThread =
          cachedData?.thread ??
          (await readCachedMessageThread(
            messageId,
            offlineCacheSettingsRef.current
          ))
        cachedThread = storedThread
          ? await applyPendingMessageMutationsToThread(storedThread)
          : null

        if (!active) {
          return
        }

        if (cachedThread) {
          setMessageThread(cachedThread)
        }

        if (isNetworkOffline()) {
          return
        }

        const data = await fetchCachedQuery(
          queryClient,
          queryKeys.messageThread(messageId),
          ({ signal }) =>
            fetchMessageThread(messageId, {
              signal,
              timeoutMs: readApiRequestTimeoutMs,
            }),
          {
            retry: false,
            staleTimeMs: 30 * 1000,
          }
        )

        const thread = await applyPendingMessageMutationsToThread(data.thread)

        if (active) {
          queryClient.setQueryData(queryKeys.messageThread(messageId), {
            thread,
          })
          setMessageThread(thread)
          persistMessageThread(messageId, thread)
        }
      } catch (error) {
        if (active) {
          if (!cachedThread) {
            handleBackgroundRequestError(error, setAuthStatus)
          }
        }
      }
    }

    void loadMessageThread()

    return () => {
      active = false
      void queryClient.cancelQueries({
        exact: true,
        queryKey: queryKeys.messageThread(messageId),
      })
    }
  }, [persistMessageThread, queryClient, selectedMessageId])
  React.useEffect(() => {
    if (!selectedMessageId) {
      return
    }

    markPerformance("reader-visible")
    measurePerformance("message-tap-to-reader", "message-tap", "reader-visible")
  }, [selectedMessageId])
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Settings is a page. Its controls own Escape; mail shortcuts must not navigate away.
      if (settingsOpen) return

      if (isCloseWindowShortcut(event)) {
        if (!selectedMessageId) {
          return
        }

        event.preventDefault()
        closeOpenedMessage()
        return
      }

      if (event.key !== "Escape") {
        return
      }

      if (
        event.defaultPrevented ||
        isEditorUiEscapeTarget(event.target) ||
        hasOpenEditorUiOverlay()
      ) {
        return
      }

      if (mobileSidebarOpen) {
        event.preventDefault()
        updateCurrentRouteSearch({ drawer: null })
        return
      }

      if (composeOpen) {
        event.preventDefault()
        updateCurrentRouteSearch({
          compose: null,
          referenceMessageId: null,
        })
        return
      }

      if (selectedMessageId) {
        event.preventDefault()
        closeOpenedMessage()
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [
    closeOpenedMessage,
    composeOpen,
    mobileSidebarOpen,
    selectedMessageId,
    settingsOpen,
    updateCurrentRouteSearch,
  ])
  React.useEffect(() => {
    if (authStatus !== "authenticated") {
      return
    }
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (isPwaMessageOfType(event.data, "app:update")) {
        void checkForPwaUpdate()
      }
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener(
        "message",
        handleServiceWorkerMessage
      )
    }

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          handleServiceWorkerMessage
        )
      }
    }
  }, [authStatus])
  function handleComposeSent() {
    setComposeDraftValues(null)
    setComposeInitialValues(null)
    clearStoredComposeDraft()
    updateCurrentRouteSearch({
      compose: null,
      referenceMessageId: null,
    })
    invalidateMessageCaches()
    setRefreshKey((currentKey) => currentKey + 1)
  }

  return {
    handleComposeSent,
    messageContainerClassName,
    messageContainerStyle,
    messageViewportStyle,
    observeMessageIframeSizeEvent,
  }
}

export type MailControllerContext = MailUiActionsContext &
  ReturnType<typeof useMailEffects>
