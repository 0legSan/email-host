import { useMailLocale } from "@workspace/mail-design"
/* eslint-disable react-hooks/exhaustive-deps -- composed controller contexts expose stable React setters and refs that the rule cannot infer. */
import * as React from "react"
import { checkForPwaUpdate } from "@workspace/pwa/react"
import {
  maximumMessageListWidth,
  maximumSidebarWidth,
  minimumMessageListWidth,
  minimumSidebarWidth,
} from "@/features/mail/controller/mail-controller-config"
import {
  clearStoredComposeDraft,
  saveComposeViewMode,
  saveMailPanelWidths,
  savePushPromptDismissed,
  saveStoredComposeDraft,
} from "@/features/mail/controller/mail-controller-storage"
import {
  standardSpecialUses,
  type MailSection,
} from "@/features/mail/model/mail-sections"
import { findSpecialMailbox } from "@/features/mail/utils/mail-format"
import type {
  ComposeDraftValues,
  ComposeInitialValues,
  ComposeViewMode,
} from "@/components/compose-panel"
import { setConvexSessionAuthenticated } from "@/lib/convex-session"
import { apiFetch, type MailAccountDto } from "@/lib/api-client"
import { webPushClient } from "@/lib/pwa"
import { registerMailtoHandler } from "@/lib/mailto-protocol-handler"
import { queryKeys } from "@/lib/query-keys"
import {
  defaultMailRouteSearch,
  toMailRouteSearch,
} from "@/lib/mail-route-state"
import {
  clearOfflineMailCache,
  clearPendingMessageMutations,
  pruneOfflineMailCache,
  saveOfflineMailCacheSettings,
  type OfflineMailCacheSettings,
} from "@/lib/offline-mail-cache"
import {
  clamp,
  getErrorMessage,
  handleBackgroundRequestError,
  handleRequestError,
  invalidateCachedQueries,
  isNetworkOffline,
  syncMailScope,
} from "./mail-controller-helpers"
import type { MailDataActionsContext } from "./use-mail-data-actions"

export function useMailBasicActions(context: MailDataActionsContext) {
  const { t } = useMailLocale()

  const {
    accounts,
    composeDraftValues,
    composeInitialValues,
    composeViewMode,
    customFoldersOnly,
    loadAccounts,
    mailboxesByAccount,
    messageListWidth,
    navigate,
    navigateToMailList,
    offlineCacheSettingsRef,
    persistCachedBootstrapPatch,
    pwaInstallPrompt,
    queryClient,
    refreshOfflineCacheStatus,
    selectedAccountId,
    selectedMailboxPath,
    selectedProfileAccountIds,
    selectedProfileId,
    selectedSpecialUse,
    setAccounts,
    setAuthStatus,
    setComposeDraftValues,
    setComposeInitialValues,
    setComposeViewMode,
    setErrorMessage,
    setExpandedSections,
    setMessageListWidth,
    setMessageThread,
    setOfflineCacheSettings,
    setOfflineCacheStatus,
    setOfflineModeActive,
    setProfiles,
    setPushLoading,
    setPushPromptDismissed,
    setPushState,
    setPushStatusMessage,
    setPwaInstallPrompt,
    setRefreshKey,
    setSelectedMessage,
    setSidebarWidth,
    setSyncLoading,
    setUser,
    sidebarWidth,
    updateCurrentRouteSearch,
  } = context
  async function handleLogout() {
    await webPushClient.unsubscribe().catch(() => undefined)
    await apiFetch<{ loggedOut: boolean }>("/api/auth/logout", {
      method: "POST",
    })
    await clearPendingMessageMutations().catch(() => undefined)
    await clearOfflineMailCache().catch(() => undefined)
    await refreshOfflineCacheStatus()
    setConvexSessionAuthenticated(false)
    setAuthStatus("anonymous")
    setUser(null)
    setAccounts([])
    setProfiles([])
    setSelectedMessage(null)
    setMessageThread(null)
    setPushState("checking")
    invalidateMailCaches()
    void navigate({
      to: "/mail",
      search: toMailRouteSearch(defaultMailRouteSearch),
      replace: true,
    })
  }
  function closeMobileSidebar() {
    updateCurrentRouteSearch(
      {
        drawer: null,
      },
      true
    )
  }
  function invalidateMailCaches() {
    invalidateCachedQueries(
      queryClient,
      (queryKey) => queryKey[0] === "mail" || queryKey[0] === "session"
    )
  }
  function invalidateMessageCaches() {
    invalidateCachedQueries(
      queryClient,
      (queryKey) =>
        queryKey[0] === "mail" &&
        (queryKey[1] === "messages" ||
          queryKey[1] === "message" ||
          queryKey[1] === "message-thread")
    )
  }
  function invalidateMessageListCaches() {
    invalidateCachedQueries(
      queryClient,
      (queryKey) => queryKey[0] === "mail" && queryKey[1] === "messages"
    )
  }
  function invalidateMailOverviewCaches() {
    invalidateCachedQueries(
      queryClient,
      (queryKey) =>
        queryKey[0] === "mail" &&
        (queryKey[1] === "accounts" ||
          queryKey[1] === "mailboxes" ||
          queryKey[1] === "messages")
    )
  }
  function invalidateMessageDetailCaches(messageIds: Set<string>) {
    invalidateCachedQueries(
      queryClient,
      (queryKey) =>
        queryKey[0] === "mail" &&
        (queryKey[1] === "message" || queryKey[1] === "message-thread") &&
        typeof queryKey[2] === "string" &&
        messageIds.has(queryKey[2])
    )
  }
  async function handleEnablePushNotifications() {
    setPushLoading(true)
    setErrorMessage(null)
    setPushStatusMessage(null)

    try {
      const subscribed = await webPushClient.subscribe(setPushStatusMessage)

      const nextPushState = await webPushClient.getCurrentState()
      queryClient.setQueryData(queryKeys.pushState(), nextPushState)
      setPushState(nextPushState)

      if (!subscribed || nextPushState !== "subscribed") {
        return
      }

      setPushPromptDismissed(false)
      savePushPromptDismissed(false)

      setPushStatusMessage(t("Отправляю проверочный push", "Sending test push"))
      const { sent } = await webPushClient.sendTest()
      setPushStatusMessage(
        sent > 0
          ? t(
              "Уведомления включены. Проверочный push отправлен.",
              "Notifications enabled. Test push sent."
            )
          : t("Уведомления включены.", "Notifications enabled.")
      )
    } catch (error) {
      handleRequestError(error, setErrorMessage, setAuthStatus)
    } finally {
      setPushLoading(false)
    }
  }
  function handleDismissPushPrompt() {
    setPushPromptDismissed(true)
    savePushPromptDismissed(true)
  }
  function handleDismissPushStatusMessage() {
    setPushStatusMessage(null)
  }
  async function syncCurrentMessageScope() {
    if (accounts.length === 0) {
      return
    }

    const selectedSyncAccountIds = new Set(selectedProfileAccountIds)
    const syncAccounts = selectedAccountId
      ? accounts.filter((account) => account.id === selectedAccountId)
      : selectedProfileId
        ? accounts.filter((account) => selectedSyncAccountIds.has(account.id))
        : accounts
    const syncTasks: Array<{
      accountId: string
      path: string | undefined
    }> = []

    for (const account of syncAccounts) {
      const accountMailboxes = mailboxesByAccount[account.id] ?? []
      const syncPaths = customFoldersOnly
        ? accountMailboxes
            .filter(
              (mailbox) =>
                !mailbox.specialUse ||
                !standardSpecialUses.has(mailbox.specialUse)
            )
            .map((mailbox) => mailbox.path)
        : [
            selectedMailboxPath ??
              (selectedSpecialUse
                ? findSpecialMailbox(accountMailboxes, selectedSpecialUse)?.path
                : undefined),
          ]

      for (const syncPath of syncPaths.length > 0 ? syncPaths : [undefined]) {
        syncTasks.push({
          accountId: account.id,
          path: syncPath,
        })
      }
    }

    if (syncTasks.length === 0) {
      return
    }

    const syncResults = await Promise.allSettled(
      syncTasks.map((task) => syncMailScope(task.accountId, task.path))
    )
    const failedSyncs: Array<{
      result: PromiseRejectedResult
      task: (typeof syncTasks)[number]
    }> = []

    syncResults.forEach((result, index) => {
      const task = syncTasks[index]

      if (result.status === "rejected" && task) {
        failedSyncs.push({ result, task })
      }
    })

    for (const failedSync of failedSyncs) {
      console.warn("Mail scope sync failed", {
        accountId: failedSync.task.accountId,
        path: failedSync.task.path,
        message: getErrorMessage(failedSync.result.reason),
      })
    }
  }
  async function refreshVisibleMail(
    options: {
      refreshAccounts?: boolean
      sync?: boolean
    } = {}
  ) {
    if (isNetworkOffline()) {
      setOfflineModeActive(true)
      await refreshOfflineCacheStatus()
      return
    }

    invalidateMailOverviewCaches()
    setRefreshKey((currentKey) => currentKey + 1)

    if (options.sync) {
      await syncCurrentMessageScope()
      invalidateMailOverviewCaches()
      setRefreshKey((currentKey) => currentKey + 1)
    }

    if (options.refreshAccounts) {
      void loadAccounts({ force: true })
    }
  }
  async function handleOfflineCacheSettingsChange(
    nextSettings: OfflineMailCacheSettings
  ) {
    const normalizedSettings = saveOfflineMailCacheSettings(nextSettings)

    offlineCacheSettingsRef.current = normalizedSettings
    setOfflineCacheSettings(normalizedSettings)

    try {
      await pruneOfflineMailCache(normalizedSettings)
      await refreshOfflineCacheStatus(normalizedSettings)
    } catch {
      setOfflineCacheStatus(null)
    }
  }
  async function handleClearOfflineCache() {
    await clearOfflineMailCache()
    setOfflineModeActive(false)
    await refreshOfflineCacheStatus()
  }
  function handleAccountUpdated(account: MailAccountDto) {
    const updateAccounts = (currentAccounts: MailAccountDto[]) =>
      currentAccounts.map((currentAccount) =>
        currentAccount.id === account.id ? account : currentAccount
      )

    setAccounts(updateAccounts)
    queryClient.setQueryData<{ accounts: MailAccountDto[] }>(
      queryKeys.accounts(),
      (data) =>
        data
          ? {
              accounts: updateAccounts(data.accounts),
            }
          : data
    )
    persistCachedBootstrapPatch({
      accounts: updateAccounts(accounts),
    })
  }
  async function handleSyncLocal() {
    setSyncLoading(true)
    setErrorMessage(null)

    try {
      void checkForPwaUpdate()
      await refreshVisibleMail({
        refreshAccounts: true,
        sync: true,
      })
    } catch (error) {
      handleBackgroundRequestError(error, setAuthStatus)
    } finally {
      setSyncLoading(false)
    }
  }
  const hideComposer = React.useCallback(() => {
    updateCurrentRouteSearch({
      compose: null,
      referenceMessageId: null,
    })
  }, [updateCurrentRouteSearch])
  const handleComposeDraftChange = React.useCallback(
    (draftValues: ComposeDraftValues) => {
      setComposeDraftValues(draftValues)
      saveStoredComposeDraft({
        draftValues,
        initialValues: composeInitialValues,
      })
    },
    [composeInitialValues]
  )
  const handleComposeViewModeChange = React.useCallback(
    (viewMode: ComposeViewMode) => {
      setComposeViewMode(viewMode)
      saveComposeViewMode(viewMode)
    },
    []
  )
  const handleInstallPwa = React.useCallback(async () => {
    if (!pwaInstallPrompt) {
      return "unavailable" as const
    }

    const prompt = pwaInstallPrompt
    setPwaInstallPrompt(null)
    await prompt.prompt()
    const choice = await prompt.userChoice

    return choice.outcome
  }, [pwaInstallPrompt])
  const handleRegisterMailtoHandler = React.useCallback(
    () =>
      registerMailtoHandler(
        navigator,
        window.location.origin,
        window.isSecureContext
      ),
    []
  )
  const discardComposer = React.useCallback(() => {
    setComposeDraftValues(null)
    setComposeInitialValues(null)
    clearStoredComposeDraft()
    hideComposer()
  }, [hideComposer])
  function selectAccountMailbox(accountId: string, mailboxPath: string) {
    navigateToMailList({
      accountId,
      compose: null,
      customFolders: null,
      drawer: null,
      flagged: null,
      path: mailboxPath,
      profileId: null,
      referenceMessageId: null,
      settings: null,
      specialUse: null,
    })
  }
  function selectFlaggedAccount(accountId: string) {
    navigateToMailList({
      accountId,
      compose: null,
      customFolders: null,
      drawer: null,
      flagged: true,
      path: null,
      profileId: null,
      referenceMessageId: null,
      settings: null,
      specialUse: null,
    })
  }
  function selectSection(section: MailSection) {
    navigateToMailList({
      accountId: null,
      compose: null,
      customFolders: null,
      drawer: null,
      flagged: Boolean(section.flagged) || null,
      path: null,
      profileId: null,
      referenceMessageId: null,
      settings: null,
      specialUse: section.specialUse,
    })
  }
  function selectProfileSection(profileId: string, section: MailSection) {
    navigateToMailList({
      accountId: null,
      compose: null,
      customFolders: null,
      drawer: null,
      flagged: Boolean(section.flagged) || null,
      path: null,
      profileId,
      referenceMessageId: null,
      settings: null,
      specialUse: section.specialUse,
    })
  }
  function selectCustomFolders() {
    navigateToMailList({
      accountId: null,
      compose: null,
      customFolders: true,
      drawer: null,
      flagged: null,
      path: null,
      profileId: null,
      referenceMessageId: null,
      settings: null,
      specialUse: null,
    })
  }
  function toggleSection(sectionId: string) {
    setExpandedSections((currentSections) => ({
      ...currentSections,
      [sectionId]: !currentSections[sectionId],
    }))
  }
  function openComposer(
    initialValues: ComposeInitialValues | null = null,
    viewMode: ComposeViewMode = composeViewMode
  ) {
    const nextInitialValues =
      initialValues ?? (composeDraftValues ? composeInitialValues : null)
    const nextDraftValues = (() => {
      if (!initialValues) {
        return composeDraftValues
      }

      const sameThread =
        composeInitialValues?.mode === initialValues.mode &&
        composeInitialValues.referenceMessageId ===
          initialValues.referenceMessageId

      return sameThread ? composeDraftValues : null
    })()

    setComposeDraftValues(nextDraftValues)
    setComposeInitialValues(nextInitialValues)
    handleComposeViewModeChange(viewMode)

    if (nextDraftValues) {
      saveStoredComposeDraft({
        draftValues: nextDraftValues,
        initialValues: nextInitialValues,
      })
    } else {
      clearStoredComposeDraft()
    }

    updateCurrentRouteSearch({
      compose: nextInitialValues?.mode ?? "new",
      referenceMessageId: nextInitialValues?.referenceMessageId ?? null,
    })
  }
  function startResize(
    panel: "sidebar" | "messageList",
    event: React.PointerEvent<HTMLDivElement>
  ) {
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      return
    }

    event.preventDefault()

    const startX = event.clientX
    const initialSidebarWidth = sidebarWidth
    const initialMessageListWidth = messageListWidth
    let nextSidebarWidth = initialSidebarWidth
    let nextMessageListWidth = initialMessageListWidth

    function handlePointerMove(pointerEvent: PointerEvent) {
      const delta = pointerEvent.clientX - startX

      if (panel === "sidebar") {
        nextSidebarWidth = clamp(
          initialSidebarWidth + delta,
          minimumSidebarWidth,
          maximumSidebarWidth
        )
        setSidebarWidth(nextSidebarWidth)
        return
      }

      nextMessageListWidth = clamp(
        initialMessageListWidth + delta,
        minimumMessageListWidth,
        maximumMessageListWidth
      )
      setMessageListWidth(nextMessageListWidth)
    }

    function stopResize() {
      saveMailPanelWidths(nextSidebarWidth, nextMessageListWidth)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopResize)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopResize)
  }

  return {
    closeMobileSidebar,
    discardComposer,
    handleAccountUpdated,
    handleClearOfflineCache,
    handleComposeDraftChange,
    handleComposeViewModeChange,
    handleDismissPushPrompt,
    handleDismissPushStatusMessage,
    handleEnablePushNotifications,
    handleInstallPwa,
    handleLogout,
    handleOfflineCacheSettingsChange,
    handleRegisterMailtoHandler,
    handleSyncLocal,
    hideComposer,
    invalidateMailCaches,
    invalidateMailOverviewCaches,
    invalidateMessageCaches,
    invalidateMessageDetailCaches,
    invalidateMessageListCaches,
    openComposer,
    refreshVisibleMail,
    selectAccountMailbox,
    selectCustomFolders,
    selectFlaggedAccount,
    selectProfileSection,
    selectSection,
    startResize,
    syncCurrentMessageScope,
    toggleSection,
  }
}

export type MailBasicActionsContext = MailDataActionsContext &
  ReturnType<typeof useMailBasicActions>
