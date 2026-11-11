import { useMailLocale } from "@workspace/mail-design"
/* eslint-disable react-hooks/exhaustive-deps -- composed controller contexts expose stable React setters and refs that the rule cannot infer. */
/* eslint-disable react-hooks/set-state-in-effect -- controller hooks synchronize local state with external mail sources. */

import * as React from "react"
import {
  initialMessagePageRequest,
  readApiRequestTimeoutMs,
  recentMessageDetailWarmBatchSize,
  recentMessageDetailWarmQueueLimit,
  type MessageListInfiniteData,
  type MessageListNavigationState,
} from "@/features/mail/controller/mail-controller-config"
import type { VisibleMessageListPosition } from "@/features/mail/message-list/message-list-types"
import { getMailAccountLabel } from "@/features/mail/utils/mail-format"
import {
  fetchMessagesBatch,
  type BootstrapDto,
  type MailPreferencesDto,
  type MessageDto,
  type MessagePageDto,
  type MessagePageRequest,
  type MessageListItemDto,
  type MessageThreadDto,
} from "@/lib/api-client"
import { markPerformance, measurePerformance } from "@/lib/performance"
import { queryKeys } from "@/lib/query-keys"
import {
  getMailRouteListScopeKey,
  getMailRouteDestination,
  hasMailSearchCriteria,
  mailRouteSearchToMessagePageRequest,
  updateMailRouteSearch,
  type MailRouteSearchPatch,
} from "@/lib/mail-route-state"
import {
  applyPendingMessageMutationsToBootstrap,
  applyPendingMessageMutationsToMessage,
  cacheBootstrap,
  cacheMessageListPosition,
  cacheMessageList,
  cacheMessageThread,
  cacheOpenedMessage,
  cacheRecentMessage,
  getOfflineMailCacheStatus,
  hasCachedMessageDetail,
  pruneOfflineMailCache,
  readCachedBootstrap,
  readCachedMessageListPosition,
  updateCachedBootstrap,
} from "@/lib/offline-mail-cache"
import {
  createMessageListNavigationState,
  getMessageListWindowPageNumbers,
  isAbortError,
  isNetworkOffline,
  normalizeMailPreferences,
} from "./mail-controller-helpers"
import type { MailPresentationState } from "./use-mail-presentation-state"

export function useMailNavigation(context: MailPresentationState) {
  const { t } = useMailLocale()

  const {
    accounts,
    firstMailDataMarkedRef,
    mailSearchSurfaceActive,
    mailboxesByAccount,
    messageListWidth,
    navigate,
    offlineCacheSettingsRef,
    offlineWarmMessageAbortRef,
    offlineWarmMessageIdsRef,
    offlineWarmMessagePromiseRef,
    offlineWarmMessageQueueRef,
    profiles,
    queryClient,
    realtimeEnabled,
    routeSearch,
    selectedAccountId,
    selectedMessageId,
    selectedProfileId,
    setAccounts,
    setAuthStatus,
    setMailPreferences,
    setMailboxesByAccount,
    setOfflineCacheStatus,
    setOfflineModeActive,
    setProfiles,
    setUser,
    sidebarWidth,
  } = context
  const selectedProfile = React.useMemo(
    () =>
      selectedProfileId
        ? (profiles.find((profile) => profile.id === selectedProfileId) ?? null)
        : null,
    [profiles, selectedProfileId]
  )
  const selectedProfileAccountIds = React.useMemo(
    () => selectedProfile?.accountIds ?? [],
    [selectedProfile]
  )
  const accountLabelById = React.useMemo(
    () =>
      new Map(
        accounts.map((account) => [account.id, getMailAccountLabel(account)])
      ),
    [accounts]
  )
  const searchHasCriteria = hasMailSearchCriteria(routeSearch)
  const searchScopeAccountIds = React.useMemo(
    () =>
      selectedAccountId
        ? [selectedAccountId]
        : selectedProfile
          ? selectedProfile.accountIds
          : accounts.map((account) => account.id),
    [accounts, selectedAccountId, selectedProfile]
  )
  const searchIndexIncomplete =
    mailSearchSurfaceActive &&
    searchHasCriteria &&
    searchScopeAccountIds.some((accountId) =>
      (mailboxesByAccount[accountId] ?? []).some(
        (mailbox) => !mailbox.searchComplete
      )
    )
  const searchScopeLabel = selectedAccountId
    ? t(
        `Поиск в «${accountLabelById.get(selectedAccountId) ?? t("Выбранный ящик", "Selected mailbox")}»`,
        `Search in "${accountLabelById.get(selectedAccountId) ?? t("Выбранный ящик", "Selected mailbox")}"`
      )
    : selectedProfile
      ? t(
          `Поиск в профиле «${selectedProfile.name}»`,
          `Search in profile "${selectedProfile.name}"`
        )
      : t("Поиск во всех ящиках", "Search all mailboxes")
  const currentMessagePageRequest = React.useMemo<MessagePageRequest>(
    () =>
      mailRouteSearchToMessagePageRequest(
        routeSearch,
        selectedProfileAccountIds
      ),
    [routeSearch, selectedProfileAccountIds]
  )
  const messageListScopeKey = React.useMemo(
    () => getMailRouteListScopeKey(routeSearch, selectedProfileAccountIds),
    [routeSearch, selectedProfileAccountIds]
  )
  const [messageListNavigation, setMessageListNavigation] =
    React.useState<MessageListNavigationState>(() =>
      createMessageListNavigationState(messageListScopeKey)
    )
  const [requestedMessageListPage, setRequestedMessageListPage] =
    React.useState<number | null>(null)
  const visibleMessageListPositionRef =
    React.useRef<VisibleMessageListPosition>({
      page: 1,
      anchorMessageId: null,
      anchorOffset: 0,
    })
  const messageListPositionPersistTimerRef = React.useRef<number | null>(null)
  // Keep fallback cursors stable until the restoration effect commits: Convex
  // treats fresh query descriptors during render as new subscriptions.
  const activeMessageListNavigation = React.useMemo(
    () =>
      messageListNavigation.scopeKey === messageListScopeKey
        ? messageListNavigation
        : createMessageListNavigationState(messageListScopeKey),
    [messageListNavigation, messageListScopeKey]
  )
  const currentMessageListPage = activeMessageListNavigation.currentPage
  const activeMessageListWindowPageNumbers = React.useMemo(
    () => getMessageListWindowPageNumbers(currentMessageListPage),
    [currentMessageListPage]
  )
  const messageListWindowPageNumbers = React.useMemo(() => {
    if (requestedMessageListPage === null) {
      return activeMessageListWindowPageNumbers
    }

    return [
      ...new Set([
        ...activeMessageListWindowPageNumbers,
        ...Array.from(
          { length: requestedMessageListPage },
          (_, index) => index + 1
        ),
      ]),
    ].sort((a, b) => a - b)
  }, [activeMessageListWindowPageNumbers, requestedMessageListPage])
  const persistCurrentMessageListPosition = React.useCallback(() => {
    const navigation =
      messageListNavigation.scopeKey === messageListScopeKey
        ? messageListNavigation
        : null

    if (!navigation?.restored) {
      return
    }

    const visiblePosition = visibleMessageListPositionRef.current
    void cacheMessageListPosition({
      scopeKey: messageListScopeKey,
      cursorSource: realtimeEnabled ? "convex" : "api",
      currentPage: visiblePosition.page,
      anchorMessageId: visiblePosition.anchorMessageId,
      anchorOffset: visiblePosition.anchorOffset,
      cursors: navigation.cursors,
    }).catch(() => undefined)
  }, [messageListNavigation, messageListScopeKey, realtimeEnabled])
  const scheduleMessageListPositionPersistence = React.useCallback(() => {
    if (messageListPositionPersistTimerRef.current !== null) {
      window.clearTimeout(messageListPositionPersistTimerRef.current)
    }

    messageListPositionPersistTimerRef.current = window.setTimeout(() => {
      messageListPositionPersistTimerRef.current = null
      persistCurrentMessageListPosition()
    }, 300)
  }, [persistCurrentMessageListPosition])
  React.useEffect(() => {
    let active = true
    const initialNavigation =
      createMessageListNavigationState(messageListScopeKey)

    setMessageListNavigation(initialNavigation)
    setRequestedMessageListPage(null)
    visibleMessageListPositionRef.current = {
      page: 1,
      anchorMessageId: null,
      anchorOffset: 0,
    }

    void readCachedMessageListPosition(messageListScopeKey)
      .then((position) => {
        if (!active) {
          return
        }

        const matchingPosition =
          position?.cursorSource === (realtimeEnabled ? "convex" : "api")
            ? position
            : null
        const restoredPage =
          matchingPosition &&
          (matchingPosition.currentPage === 1 ||
            matchingPosition.cursors[String(matchingPosition.currentPage)] !==
              undefined)
            ? matchingPosition.currentPage
            : 1
        const restoredPosition =
          matchingPosition && restoredPage === matchingPosition.currentPage
            ? matchingPosition
            : null

        visibleMessageListPositionRef.current = {
          page: restoredPage,
          anchorMessageId: restoredPosition?.anchorMessageId ?? null,
          anchorOffset: restoredPosition?.anchorOffset ?? 0,
        }
        setMessageListNavigation({
          scopeKey: messageListScopeKey,
          currentPage: restoredPage,
          cursors: restoredPosition?.cursors ?? { "1": null },
          restoredPosition,
          restored: true,
        })
      })
      .catch(() => {
        if (active) {
          setMessageListNavigation({
            ...initialNavigation,
            restored: true,
          })
        }
      })

    return () => {
      active = false
    }
  }, [messageListScopeKey, realtimeEnabled])
  React.useEffect(() => {
    const persistWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        persistCurrentMessageListPosition()
      }
    }

    window.addEventListener("pagehide", persistCurrentMessageListPosition)
    document.addEventListener("visibilitychange", persistWhenHidden)

    return () => {
      persistCurrentMessageListPosition()
      window.removeEventListener("pagehide", persistCurrentMessageListPosition)
      document.removeEventListener("visibilitychange", persistWhenHidden)
      if (messageListPositionPersistTimerRef.current !== null) {
        window.clearTimeout(messageListPositionPersistTimerRef.current)
      }
    }
  }, [persistCurrentMessageListPosition])
  React.useEffect(() => {
    if (
      messageListNavigation.scopeKey === messageListScopeKey &&
      messageListNavigation.restored
    ) {
      scheduleMessageListPositionPersistence()
    }
  }, [
    messageListNavigation.currentPage,
    messageListNavigation.cursors,
    messageListNavigation.restored,
    messageListNavigation.scopeKey,
    messageListScopeKey,
    scheduleMessageListPositionPersistence,
  ])
  const navigateToMailList = React.useCallback(
    (patch: MailRouteSearchPatch = {}, replace = false) => {
      void navigate({
        to: "/mail",
        search: updateMailRouteSearch(routeSearch, patch),
        replace,
      })
    },
    [navigate, routeSearch]
  )
  const updateCurrentRouteSearch = React.useCallback(
    (patch: MailRouteSearchPatch = {}, replace = false) => {
      const search = updateMailRouteSearch(routeSearch, patch)

      void navigate({
        ...getMailRouteDestination(search, selectedMessageId),
        replace,
      })
    },
    [navigate, routeSearch, selectedMessageId]
  )
  const navigateToMessage = React.useCallback(
    (messageId: string) => {
      void navigate({
        to: "/mail/message/$messageId",
        params: {
          messageId,
        },
        search: updateMailRouteSearch(routeSearch, {
          compose: null,
          drawer: null,
          referenceMessageId: null,
          settings: null,
        }),
      })
    },
    [navigate, routeSearch]
  )
  const navigateBackToMailList = React.useCallback(() => {
    void navigate({
      to: "/mail",
      search: updateMailRouteSearch(routeSearch, {
        compose: null,
        drawer: null,
        referenceMessageId: null,
        settings: null,
      }),
      replace: true,
    })
  }, [navigate, routeSearch])
  const closeOpenedMessage = React.useCallback(() => {
    void navigate({
      to: "/mail",
      search: updateMailRouteSearch(routeSearch, {
        compose: null,
        drawer: null,
        referenceMessageId: null,
        settings: null,
      }),
      replace: true,
    })
  }, [navigate, routeSearch])
  const layoutColumns = `${sidebarWidth}px 6px ${messageListWidth}px 6px minmax(0, 1fr)`
  const refreshOfflineCacheStatus = React.useCallback(
    async (settings = offlineCacheSettingsRef.current) => {
      try {
        const status = await getOfflineMailCacheStatus(settings)

        setOfflineCacheStatus(status)
      } catch {
        setOfflineCacheStatus(null)
      }
    },
    []
  )
  const cacheMaintenanceTimerRef = React.useRef<number | null>(null)
  const scheduleCacheMaintenance = React.useCallback(() => {
    if (cacheMaintenanceTimerRef.current !== null) return
    cacheMaintenanceTimerRef.current = window.setTimeout(() => {
      cacheMaintenanceTimerRef.current = null
      const settings = offlineCacheSettingsRef.current
      void pruneOfflineMailCache(settings)
        .then(() => refreshOfflineCacheStatus(settings))
        .catch(() => undefined)
    }, 1_000)
  }, [refreshOfflineCacheStatus])
  React.useEffect(
    () => () => {
      if (cacheMaintenanceTimerRef.current !== null)
        window.clearTimeout(cacheMaintenanceTimerRef.current)
    },
    []
  )
  const persistBootstrap = React.useCallback(
    (data: BootstrapDto) => {
      const settings = offlineCacheSettingsRef.current

      if (!settings.enabled) {
        return
      }

      void (async () => {
        try {
          await cacheBootstrap(data, settings)
          scheduleCacheMaintenance()
        } catch {
          return undefined
        }
      })()
    },
    [scheduleCacheMaintenance]
  )
  const persistCachedBootstrapPatch = React.useCallback(
    (
      patch: Partial<
        Pick<
          BootstrapDto,
          "accounts" | "mailboxesByAccount" | "preferences" | "profiles"
        >
      >
    ) => {
      const settings = offlineCacheSettingsRef.current

      if (!settings.enabled) {
        return
      }

      void (async () => {
        try {
          await updateCachedBootstrap(patch, settings)
          await refreshOfflineCacheStatus(settings)
        } catch {
          return undefined
        }
      })()
    },
    [refreshOfflineCacheStatus]
  )
  const applyMailPreferences = React.useCallback(
    (preferences: MailPreferencesDto) => {
      const normalizedPreferences = normalizeMailPreferences(preferences)

      setMailPreferences(normalizedPreferences)
      queryClient.setQueryData(queryKeys.preferences(), {
        preferences: normalizedPreferences,
      })
      persistCachedBootstrapPatch({
        preferences: normalizedPreferences,
      })

      return normalizedPreferences
    },
    [persistCachedBootstrapPatch, queryClient]
  )
  const persistMessageList = React.useCallback(
    (request: MessagePageRequest, page: MessagePageDto) => {
      const settings = offlineCacheSettingsRef.current

      if (!settings.enabled) {
        return
      }

      void (async () => {
        try {
          await cacheMessageList(request, page, settings)
          scheduleCacheMaintenance()
        } catch {
          return undefined
        }
      })()
    },
    [scheduleCacheMaintenance]
  )
  const persistOpenedMessage = React.useCallback(
    (message: MessageDto) => {
      const settings = offlineCacheSettingsRef.current

      if (!settings.enabled) {
        return
      }

      void (async () => {
        try {
          await cacheOpenedMessage(message, settings)
          scheduleCacheMaintenance()
        } catch {
          return undefined
        }
      })()
    },
    [scheduleCacheMaintenance]
  )
  const persistMessageThread = React.useCallback(
    (messageId: string, thread: MessageThreadDto) => {
      const settings = offlineCacheSettingsRef.current

      if (!settings.enabled) {
        return
      }

      void cacheMessageThread(messageId, thread, settings).catch(
        () => undefined
      )
    },
    []
  )
  const warmRecentMessageDetails = React.useCallback(
    (listMessages: MessageListItemDto[]) => {
      const settings = offlineCacheSettingsRef.current

      if (
        !settings.enabled ||
        settings.messageMode !== "recent-and-opened" ||
        isNetworkOffline() ||
        document.visibilityState !== "visible"
      ) {
        return
      }

      if (listMessages.length === 0) {
        return
      }

      const scheduledMessageIds = offlineWarmMessageIdsRef.current
      const messageQueue = offlineWarmMessageQueueRef.current
      const queueLimit = Math.min(
        settings.maxMessages,
        recentMessageDetailWarmQueueLimit
      )

      for (const message of listMessages) {
        if (scheduledMessageIds.has(message.id)) {
          continue
        }

        scheduledMessageIds.add(message.id)
        messageQueue.push(message.id)
      }

      while (messageQueue.length > queueLimit) {
        const droppedMessageId = messageQueue.shift()

        if (droppedMessageId) {
          scheduledMessageIds.delete(droppedMessageId)
        }
      }

      if (messageQueue.length === 0 || offlineWarmMessagePromiseRef.current) {
        return
      }

      const controller = new AbortController()
      offlineWarmMessageAbortRef.current = controller

      const warmPromise = (async () => {
        let activeMessageIds: string[] = []
        let cacheChanged = false

        try {
          while (
            messageQueue.length > 0 &&
            !controller.signal.aborted &&
            !isNetworkOffline() &&
            document.visibilityState === "visible"
          ) {
            activeMessageIds = messageQueue.splice(
              0,
              recentMessageDetailWarmBatchSize
            )
            const uncachedMessageIds: string[] = []

            for (const messageId of activeMessageIds) {
              if (controller.signal.aborted) {
                break
              }

              try {
                if (!(await hasCachedMessageDetail(messageId, settings))) {
                  uncachedMessageIds.push(messageId)
                }
              } catch {
                continue
              }
            }

            if (controller.signal.aborted) {
              break
            }

            if (uncachedMessageIds.length > 0) {
              const data = await fetchMessagesBatch(uncachedMessageIds, {
                signal: controller.signal,
                timeoutMs: readApiRequestTimeoutMs,
              })

              for (const serverMessage of data.messages) {
                if (controller.signal.aborted) {
                  break
                }

                const message =
                  await applyPendingMessageMutationsToMessage(serverMessage)

                await cacheRecentMessage(message, settings)
                cacheChanged = true
              }
            }

            for (const messageId of activeMessageIds) {
              scheduledMessageIds.delete(messageId)
            }
            activeMessageIds = []
          }

          if (cacheChanged && !controller.signal.aborted) {
            await pruneOfflineMailCache(settings)
            await refreshOfflineCacheStatus(settings)
          }
        } catch (error) {
          if (!isAbortError(error)) {
            return undefined
          }
        } finally {
          for (const messageId of activeMessageIds) {
            scheduledMessageIds.delete(messageId)
          }
        }
      })()

      const trackedWarmPromise = warmPromise.finally(() => {
        if (offlineWarmMessagePromiseRef.current === trackedWarmPromise) {
          offlineWarmMessagePromiseRef.current = null
        }
        if (offlineWarmMessageAbortRef.current === controller) {
          offlineWarmMessageAbortRef.current = null
        }
      })

      offlineWarmMessagePromiseRef.current = trackedWarmPromise
      void trackedWarmPromise
    },
    [refreshOfflineCacheStatus]
  )
  const applyBootstrapData = React.useCallback(
    (data: BootstrapDto, source: "network" | "cache" | "offline") => {
      const queryDataOptions =
        source === "network" ? undefined : { updatedAt: 0 }

      markPerformance("auth-resolved")
      measurePerformance("boot-to-auth", "app-boot", "auth-resolved")
      queryClient.setQueryData(queryKeys.bootstrap(), data, queryDataOptions)
      queryClient.setQueryData(
        queryKeys.session(),
        {
          user: data.user,
        },
        queryDataOptions
      )
      queryClient.setQueryData(
        queryKeys.accounts(),
        {
          accounts: data.accounts,
        },
        queryDataOptions
      )
      queryClient.setQueryData(
        queryKeys.profiles(),
        {
          profiles: data.profiles,
        },
        queryDataOptions
      )
      queryClient.setQueryData(
        queryKeys.preferences(),
        {
          preferences: normalizeMailPreferences(data.preferences),
        },
        queryDataOptions
      )
      for (const [accountId, mailboxes] of Object.entries(
        data.mailboxesByAccount
      )) {
        queryClient.setQueryData(
          queryKeys.mailboxes(accountId),
          {
            mailboxes,
          },
          queryDataOptions
        )
      }
      queryClient.setQueryData<MessageListInfiniteData>(
        queryKeys.messageList(initialMessagePageRequest),
        {
          pageParams: [null],
          pages: [data.initialMessages.page],
        },
        queryDataOptions
      )
      queryClient.setQueryData<MessagePageDto>(
        queryKeys.messageListPage(initialMessagePageRequest),
        data.initialMessages.page,
        queryDataOptions
      )
      setUser(data.user)
      setAccounts(data.accounts)
      setProfiles(data.profiles)
      setMailPreferences(normalizeMailPreferences(data.preferences))
      setMailboxesByAccount(data.mailboxesByAccount)
      if (!firstMailDataMarkedRef.current) {
        firstMailDataMarkedRef.current = true
        markPerformance("first-mail-data-ready")
        measurePerformance(
          "boot-to-first-mail-data",
          "app-boot",
          "first-mail-data-ready"
        )
      }
      setOfflineModeActive(source === "offline")
      setAuthStatus("authenticated")
    },
    [queryClient]
  )
  const restoreBootstrapFromOfflineCache = React.useCallback(
    async (source: "cache" | "offline") => {
      try {
        const cachedBootstrap = await readCachedBootstrap(
          offlineCacheSettingsRef.current
        )

        if (!cachedBootstrap) {
          return false
        }

        const data =
          await applyPendingMessageMutationsToBootstrap(cachedBootstrap)

        applyBootstrapData(data, source)
        await refreshOfflineCacheStatus()
        return true
      } catch {
        // Unavailable browser storage must not prevent an online login.
        return false
      }
    },
    [applyBootstrapData, refreshOfflineCacheStatus]
  )

  return {
    accountLabelById,
    activeMessageListNavigation,
    activeMessageListWindowPageNumbers,
    applyBootstrapData,
    applyMailPreferences,
    closeOpenedMessage,
    currentMessageListPage,
    currentMessagePageRequest,
    layoutColumns,
    messageListNavigation,
    messageListPositionPersistTimerRef,
    messageListScopeKey,
    messageListWindowPageNumbers,
    navigateBackToMailList,
    navigateToMailList,
    navigateToMessage,
    persistBootstrap,
    persistCachedBootstrapPatch,
    persistCurrentMessageListPosition,
    persistMessageList,
    persistMessageThread,
    persistOpenedMessage,
    refreshOfflineCacheStatus,
    requestedMessageListPage,
    restoreBootstrapFromOfflineCache,
    scheduleMessageListPositionPersistence,
    searchHasCriteria,
    searchIndexIncomplete,
    searchScopeAccountIds,
    searchScopeLabel,
    selectedProfile,
    selectedProfileAccountIds,
    setMessageListNavigation,
    setRequestedMessageListPage,
    updateCurrentRouteSearch,
    visibleMessageListPositionRef,
    warmRecentMessageDetails,
  }
}

export type MailNavigationContext = MailPresentationState &
  ReturnType<typeof useMailNavigation>
