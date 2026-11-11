import { mailText } from "@workspace/mail-design/locale"
import { localizeMailFeedback } from "./mail-feedback-text"
import { useMailLocale } from "@workspace/mail-design"
/* eslint-disable react-hooks/set-state-in-effect -- controller hooks synchronize local state with external mail sources. */

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useLocation, useNavigate } from "@tanstack/react-router"
import { type PushSubscriptionState } from "@workspace/pwa/client"
import { usePwaUpdate } from "@workspace/pwa/react"
import {
  defaultMailPreferences,
  type EmailRenderCacheEntry,
  type EmailRenderModeOverrides,
  type PwaInstallPromptEvent,
} from "@/features/mail/controller/mail-controller-config"
import {
  clearStoredComposeDraft,
  isPwaInstallPromptEvent,
  isPwaStandalone,
  loadComposeViewMode,
  loadEmailRenderModeOverrides,
  loadMailPanelWidths,
  loadPushPromptDismissed,
  loadStoredComposeDraft,
  saveEmailRenderModeOverrides,
} from "@/features/mail/controller/mail-controller-storage"
import type {
  ComposeDraftValues,
  ComposeInitialValues,
  ComposeViewMode,
} from "@/components/compose-panel"
import type { MessageWidthMode } from "@/features/mail/reader/message-reader-pane"
import {
  type MailAccountDto,
  type MailContactDto,
  type MailboxDto,
  type MailPreferencesDto,
  type MailProfileDto,
  type MessageDto,
  type MessageListItemDto,
  type MessageThreadDto,
  type UserDto,
} from "@/lib/api-client"
import { parseMailtoUrl, plainTextToComposeHtml } from "@/lib/mailto"
import {
  getMailMessageIdFromPath,
  normalizeMailRouteSearch,
  updateMailRouteSearch,
} from "@/lib/mail-route-state"
import {
  routeSearchToMailSearchValue,
  type MailSearchValue,
} from "@/lib/mail-search"
import {
  loadOfflineMailCacheSettings,
  type OfflineMailCacheSettings,
  type OfflineMailCacheStatus,
} from "@/lib/offline-mail-cache"
import {
  buildEmailHtmlDocument,
  createEmailRenderCacheKey,
  type EmailRenderMode,
} from "@/lib/email-render"
import {
  buildPlainTextEmailHtml,
  getCurrentNetworkOnline,
  getEmailRenderPreferenceKey,
  pruneEmailRenderCache,
} from "./mail-controller-helpers"

export function useMailPresentationState({
  realtimeEnabled,
}: {
  realtimeEnabled: boolean
}) {
  useMailLocale()

  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [authStatus, setAuthStatus] = React.useState<
    "checking" | "authenticated" | "anonymous"
  >("checking")
  const {
    applyUpdate: applyServiceWorkerUpdate,
    dismissUpdate: dismissServiceWorkerUpdate,
    updateAvailable: serviceWorkerUpdateAvailable,
    updating: serviceWorkerUpdating,
  } = usePwaUpdate({ enabled: authStatus === "authenticated" })
  const [user, setUser] = React.useState<UserDto | null>(null)
  const [knownContacts, setKnownContacts] = React.useState<MailContactDto[]>([])
  const [accounts, setAccounts] = React.useState<MailAccountDto[]>([])
  const [profiles, setProfiles] = React.useState<MailProfileDto[]>([])
  const [mailPreferences, setMailPreferences] =
    React.useState<MailPreferencesDto>(defaultMailPreferences)
  const [mailboxesByAccount, setMailboxesByAccount] = React.useState<
    Record<string, MailboxDto[]>
  >({})
  const [selectedMessageIds, setSelectedMessageIds] = React.useState<
    Set<string>
  >(() => new Set())
  const [selectedMessage, setSelectedMessage] =
    React.useState<MessageDto | null>(null)
  const [messageThread, setMessageThread] =
    React.useState<MessageThreadDto | null>(null)
  const [searchInput, setSearchInput] = React.useState("")
  const [messageWidthMode, setMessageWidthMode] =
    React.useState<MessageWidthMode>("fixed")
  const [messageIframeHeight, setMessageIframeHeight] = React.useState(560)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [accountsLoading, setAccountsLoading] = React.useState(false)
  const [profilesLoading, setProfilesLoading] = React.useState(false)
  const [mailboxesLoading, setMailboxesLoading] = React.useState(false)
  const [messageLoading, setMessageLoading] = React.useState(false)
  const [settledMessageId, setSettledMessageId] = React.useState<string | null>(
    null
  )
  const [syncLoading, setSyncLoading] = React.useState(false)
  const [pushState, setPushState] =
    React.useState<PushSubscriptionState>("checking")
  const [pushLoading, setPushLoading] = React.useState(false)
  const [pushStatusMessage, setPushStatusMessage] = React.useState<
    string | null
  >(null)
  const [pushPromptDismissed, setPushPromptDismissed] = React.useState(() =>
    loadPushPromptDismissed()
  )
  const [pwaInstallPrompt, setPwaInstallPrompt] =
    React.useState<PwaInstallPromptEvent | null>(null)
  const [pwaInstalled, setPwaInstalled] = React.useState(isPwaStandalone)
  const [storedComposeDraft] = React.useState(() => loadStoredComposeDraft())
  const [composeViewMode, setComposeViewMode] = React.useState<ComposeViewMode>(
    () => loadComposeViewMode()
  )
  const [composeInitialValues, setComposeInitialValues] =
    React.useState<ComposeInitialValues | null>(
      () => storedComposeDraft?.initialValues ?? null
    )
  const [composeDraftValues, setComposeDraftValues] =
    React.useState<ComposeDraftValues | null>(
      () => storedComposeDraft?.draftValues ?? null
    )
  const [customMoveDialogOpen, setCustomMoveDialogOpen] = React.useState(false)
  const [customMoveTargetPath, setCustomMoveTargetPath] = React.useState("")
  const [offlineCacheSettings, setOfflineCacheSettings] =
    React.useState<OfflineMailCacheSettings>(() =>
      loadOfflineMailCacheSettings()
    )
  const [emailRenderModeOverrides, setEmailRenderModeOverrides] =
    React.useState<EmailRenderModeOverrides>(() =>
      loadEmailRenderModeOverrides()
    )
  const [offlineCacheStatus, setOfflineCacheStatus] =
    React.useState<OfflineMailCacheStatus | null>(null)
  const [offlineModeActive, setOfflineModeActive] = React.useState(false)
  const [networkOnline, setNetworkOnline] = React.useState(() =>
    getCurrentNetworkOnline()
  )
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [initialPanelWidths] = React.useState(() => loadMailPanelWidths())
  const [sidebarWidth, setSidebarWidth] = React.useState(
    initialPanelWidths.sidebarWidth
  )
  const [messageListWidth, setMessageListWidth] = React.useState(
    initialPanelWidths.messageListWidth
  )
  const [expandedSections, setExpandedSections] = React.useState<
    Record<string, boolean>
  >({
    inbox: true,
    pinned: false,
    sent: false,
    drafts: false,
    junk: false,
    trash: false,
    folders: false,
  })
  const [isDarkTheme, setIsDarkTheme] = React.useState(false)
  const firstMailDataMarkedRef = React.useRef(false)
  const mailPreferencesRef = React.useRef(mailPreferences)
  const profilesRef = React.useRef(profiles)
  const offlineCacheSettingsRef = React.useRef(offlineCacheSettings)
  const offlineWarmMessageIdsRef = React.useRef(new Set<string>())
  const offlineWarmMessageQueueRef = React.useRef<string[]>([])
  const offlineWarmMessagePromiseRef = React.useRef<Promise<void> | null>(null)
  const offlineWarmMessageAbortRef = React.useRef<AbortController | null>(null)
  const offlineWarmVisibleMessagesRef = React.useRef<MessageListItemDto[]>([])
  const persistedMessageListPageSourcesRef = React.useRef(
    new Map<string, object>()
  )
  const pendingMessageSyncPromiseRef = React.useRef<Promise<void> | null>(null)
  const pendingMessageSyncRetryRef = React.useRef<number | null>(null)
  const messageIframeRef = React.useRef<HTMLIFrameElement>(null)
  const messageIframeResizeCleanupRef = React.useRef<(() => void) | null>(null)
  const emailRenderCacheRef = React.useRef(
    new Map<string, EmailRenderCacheEntry>()
  )
  const routeSearch = React.useMemo(
    () => normalizeMailRouteSearch(location.search as Record<string, unknown>),
    [location.search]
  )
  const selectedMessageId = React.useMemo(
    () => getMailMessageIdFromPath(location.pathname),
    [location.pathname]
  )
  const activeSelectedMessage =
    selectedMessage?.id === selectedMessageId ? selectedMessage : null
  const selectedEmailRenderPreferenceKey = React.useMemo(
    () =>
      getEmailRenderPreferenceKey(
        activeSelectedMessage?.from?.address ?? null,
        selectedMessageId
      ),
    [activeSelectedMessage?.from?.address, selectedMessageId]
  )
  const selectedEmailRenderMode = selectedEmailRenderPreferenceKey
    ? (emailRenderModeOverrides[selectedEmailRenderPreferenceKey] ?? "auto")
    : "auto"
  const effectiveSelectedEmailRenderMode =
    selectedEmailRenderMode === "auto"
      ? isDarkTheme
        ? "dark"
        : "original"
      : selectedEmailRenderMode
  const setSelectedEmailRenderMode = React.useCallback(
    (mode: EmailRenderMode) => {
      if (!selectedEmailRenderPreferenceKey) {
        return
      }

      setEmailRenderModeOverrides((currentOverrides) => {
        const nextOverrides = {
          ...currentOverrides,
        }

        if (mode === "auto") {
          delete nextOverrides[selectedEmailRenderPreferenceKey]
        } else {
          nextOverrides[selectedEmailRenderPreferenceKey] = mode
        }

        saveEmailRenderModeOverrides(nextOverrides)
        return nextOverrides
      })
    },
    [selectedEmailRenderPreferenceKey]
  )
  const selectedAccountId = routeSearch.accountId
  const selectedProfileId = routeSearch.profileId
  const selectedMailboxPath = routeSearch.path
  const selectedSpecialUse = routeSearch.specialUse
  const customFoldersOnly = routeSearch.customFolders
  const searchQuery = routeSearch.q
  const unreadOnly = routeSearch.unread
  const flaggedOnly = routeSearch.flagged
  const mailSearchValue = React.useMemo<MailSearchValue>(
    () => routeSearchToMailSearchValue(routeSearch, searchInput),
    [routeSearch, searchInput]
  )
  const mailSearchSurfaceActive = routeSearch.searchMode
  const mobileSidebarOpen = routeSearch.drawer === "menu"
  const settingsOpen = routeSearch.settings !== null
  const composeOpen = routeSearch.compose !== null
  const pushPromptVisible =
    pushState === "granted" || (pushState === "default" && !pushPromptDismissed)
  const [selectedEmailRender, setSelectedEmailRender] = React.useState<{
    backgroundColor: string | null
    document: string | null
    messageId: string | null
  }>({
    backgroundColor: null,
    document: null,
    messageId: null,
  })
  React.useEffect(() => {
    if (!composeOpen || !composeDraftValues) {
      return
    }

    const composeMode = composeInitialValues?.mode ?? "new"
    const composeReferenceMessageId =
      composeInitialValues?.referenceMessageId ?? null

    if (
      routeSearch.compose !== composeMode ||
      routeSearch.referenceMessageId !== composeReferenceMessageId
    ) {
      setComposeDraftValues(null)
      setComposeInitialValues(null)
      clearStoredComposeDraft()
    }
  }, [
    composeDraftValues,
    composeInitialValues,
    composeOpen,
    routeSearch.compose,
    routeSearch.referenceMessageId,
  ])
  React.useEffect(() => {
    if (authStatus !== "authenticated" || !routeSearch.mailto) {
      return
    }

    const mailtoRequest = parseMailtoUrl(routeSearch.mailto)

    if (mailtoRequest) {
      setComposeDraftValues(null)
      setComposeInitialValues({
        title: mailText("Новое письмо", "New message"),
        accountId: routeSearch.accountId ?? "",
        to: mailtoRequest.to,
        cc: mailtoRequest.cc,
        bcc: mailtoRequest.bcc,
        subject: mailtoRequest.subject,
        html: plainTextToComposeHtml(mailtoRequest.body),
        mode: "new",
      })
      clearStoredComposeDraft()
    }

    void navigate({
      to: "/mail",
      replace: true,
      search: updateMailRouteSearch(routeSearch, {
        compose: mailtoRequest ? "new" : null,
        mailto: null,
        referenceMessageId: null,
        settings: null,
      }),
    })
  }, [authStatus, navigate, routeSearch])
  React.useEffect(() => {
    mailPreferencesRef.current = mailPreferences
  }, [mailPreferences])
  React.useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      if (!isPwaInstallPromptEvent(event)) {
        return
      }

      event.preventDefault()
      setPwaInstallPrompt(event)
    }
    const handleAppInstalled = () => {
      setPwaInstallPrompt(null)
      setPwaInstalled(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      )
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])
  React.useEffect(() => {
    const preventNativeContextMenu = (event: MouseEvent) => {
      const target = event.target

      if (
        target instanceof Element &&
        target.closest('[data-allow-native-context-menu="true"]')
      ) {
        return
      }

      event.preventDefault()
    }

    window.addEventListener("contextmenu", preventNativeContextMenu, true)
    document.addEventListener("contextmenu", preventNativeContextMenu, true)

    return () => {
      window.removeEventListener("contextmenu", preventNativeContextMenu, true)
      document.removeEventListener(
        "contextmenu",
        preventNativeContextMenu,
        true
      )
    }
  }, [])
  React.useEffect(() => {
    profilesRef.current = profiles
  }, [profiles])
  const selectedMessageHtml = activeSelectedMessage?.html ?? null
  const selectedMessageText = activeSelectedMessage?.text ?? null
  const selectedMessageSnippet = activeSelectedMessage?.snippet ?? null
  const selectedMessageOpening = Boolean(
    selectedMessageId && settledMessageId !== selectedMessageId
  )
  const selectedMessageBodyPending = Boolean(
    activeSelectedMessage?.bodyStatus === "not_loaded" &&
    !selectedMessageHtml &&
    !selectedMessageText
  )
  const selectedMessageDisplayHtml = React.useMemo(() => {
    if (selectedMessageHtml) {
      return selectedMessageHtml
    }

    const canUseSnippet =
      activeSelectedMessage?.bodyStatus === "loaded" ||
      activeSelectedMessage?.bodyStatus === undefined
    const text =
      selectedMessageText ?? (canUseSnippet ? selectedMessageSnippet : null)

    return text ? buildPlainTextEmailHtml(text) : null
  }, [
    activeSelectedMessage?.bodyStatus,
    selectedMessageHtml,
    selectedMessageSnippet,
    selectedMessageText,
  ])
  React.useEffect(() => {
    const messageId = activeSelectedMessage?.id ?? null
    const html = selectedMessageDisplayHtml

    if (!messageId || !html) {
      if (
        selectedMessageId &&
        (selectedMessageOpening || selectedMessageBodyPending)
      ) {
        return
      }

      setSelectedEmailRender({
        backgroundColor: null,
        document: null,
        messageId,
      })
      return
    }

    const cacheKey = createEmailRenderCacheKey(
      messageId,
      html,
      isDarkTheme,
      effectiveSelectedEmailRenderMode
    )
    const cachedRender = emailRenderCacheRef.current.get(cacheKey)

    if (cachedRender) {
      setSelectedEmailRender({
        backgroundColor: cachedRender.backgroundColor,
        document: cachedRender.document,
        messageId,
      })
      return
    }

    let active = true
    const timeoutId = window.setTimeout(() => {
      const emailRender = buildEmailHtmlDocument(
        html,
        isDarkTheme,
        effectiveSelectedEmailRenderMode
      )

      if (active) {
        emailRenderCacheRef.current.set(cacheKey, {
          backgroundColor: emailRender.backgroundColor,
          document: emailRender.document,
        })
        pruneEmailRenderCache(emailRenderCacheRef.current)
        React.startTransition(() => {
          setSelectedEmailRender({
            backgroundColor: emailRender.backgroundColor,
            document: emailRender.document,
            messageId,
          })
        })
      }
    }, 0)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [
    effectiveSelectedEmailRenderMode,
    isDarkTheme,
    selectedMessageDisplayHtml,
    selectedMessageBodyPending,
    selectedMessageId,
    selectedMessageOpening,
    activeSelectedMessage?.id,
  ])
  const selectedMessageRenderReady =
    selectedEmailRender.messageId === activeSelectedMessage?.id
  const selectedMessageBackgroundColor = selectedMessageRenderReady
    ? selectedEmailRender.backgroundColor
    : null
  const currentSelectedMessageHtmlDocument = selectedMessageRenderReady
    ? selectedEmailRender.document
    : null
  const selectedMessageHtmlPreparing = Boolean(
    selectedMessageOpening ||
    selectedMessageBodyPending ||
    (selectedMessageDisplayHtml && !currentSelectedMessageHtmlDocument)
  )
  const selectedMessageHtmlDocument = selectedMessageRenderReady
    ? currentSelectedMessageHtmlDocument
    : selectedMessageHtmlPreparing
      ? selectedEmailRender.document
      : null
  React.useEffect(() => {
    if (
      activeSelectedMessage &&
      activeSelectedMessage.bodyStatus !== "not_loaded" &&
      !activeSelectedMessage.html &&
      !activeSelectedMessage.text
    ) {
      console.warn("Mail message detail loaded without body content", {
        attachmentCount: activeSelectedMessage.attachments.length,
        hasAttachments: activeSelectedMessage.hasAttachments,
        messageId: activeSelectedMessage.id,
        snippetLength: activeSelectedMessage.snippet?.length ?? 0,
      })
    }
  }, [activeSelectedMessage])

  return {
    realtimeEnabled,
    accounts,
    accountsLoading,
    activeSelectedMessage,
    applyServiceWorkerUpdate,
    authStatus,
    composeDraftValues,
    composeInitialValues,
    composeOpen,
    composeViewMode,
    currentSelectedMessageHtmlDocument,
    customFoldersOnly,
    customMoveDialogOpen,
    customMoveTargetPath,
    dismissServiceWorkerUpdate,
    effectiveSelectedEmailRenderMode,
    emailRenderCacheRef,
    emailRenderModeOverrides,
    errorMessage: localizeMailFeedback(errorMessage),
    expandedSections,
    firstMailDataMarkedRef,
    flaggedOnly,
    initialPanelWidths,
    isDarkTheme,
    knownContacts,
    location,
    mailPreferences,
    mailPreferencesRef,
    mailSearchSurfaceActive,
    mailSearchValue,
    mailboxesByAccount,
    mailboxesLoading,
    messageIframeHeight,
    messageIframeRef,
    messageIframeResizeCleanupRef,
    messageListWidth,
    messageLoading,
    messageThread,
    messageWidthMode,
    mobileSidebarOpen,
    navigate,
    networkOnline,
    offlineCacheSettings,
    offlineCacheSettingsRef,
    offlineCacheStatus,
    offlineModeActive,
    offlineWarmMessageAbortRef,
    offlineWarmMessageIdsRef,
    offlineWarmMessagePromiseRef,
    offlineWarmMessageQueueRef,
    offlineWarmVisibleMessagesRef,
    pendingMessageSyncPromiseRef,
    pendingMessageSyncRetryRef,
    persistedMessageListPageSourcesRef,
    profiles,
    profilesLoading,
    profilesRef,
    pushLoading,
    pushPromptDismissed,
    pushPromptVisible,
    pushState,
    pushStatusMessage: localizeMailFeedback(pushStatusMessage),
    pwaInstallPrompt,
    pwaInstalled,
    queryClient,
    refreshKey,
    routeSearch,
    searchInput,
    searchQuery,
    selectedAccountId,
    selectedEmailRender,
    selectedEmailRenderMode,
    selectedEmailRenderPreferenceKey,
    selectedMailboxPath,
    selectedMessage,
    selectedMessageBackgroundColor,
    selectedMessageBodyPending,
    selectedMessageDisplayHtml,
    selectedMessageHtml,
    selectedMessageHtmlDocument,
    selectedMessageHtmlPreparing,
    selectedMessageId,
    selectedMessageIds,
    selectedMessageOpening,
    selectedMessageRenderReady,
    selectedMessageSnippet,
    selectedMessageText,
    selectedProfileId,
    selectedSpecialUse,
    serviceWorkerUpdateAvailable,
    serviceWorkerUpdating,
    setAccounts,
    setAccountsLoading,
    setAuthStatus,
    setComposeDraftValues,
    setComposeInitialValues,
    setComposeViewMode,
    setCustomMoveDialogOpen,
    setCustomMoveTargetPath,
    setEmailRenderModeOverrides,
    setErrorMessage,
    setExpandedSections,
    setIsDarkTheme,
    setKnownContacts,
    setMailPreferences,
    setMailboxesByAccount,
    setMailboxesLoading,
    setMessageIframeHeight,
    setMessageListWidth,
    setMessageLoading,
    setMessageThread,
    setMessageWidthMode,
    setNetworkOnline,
    setOfflineCacheSettings,
    setOfflineCacheStatus,
    setOfflineModeActive,
    setProfiles,
    setProfilesLoading,
    setPushLoading,
    setPushPromptDismissed,
    setPushState,
    setPushStatusMessage,
    setPwaInstallPrompt,
    setPwaInstalled,
    setRefreshKey,
    setSearchInput,
    setSelectedEmailRender,
    setSelectedEmailRenderMode,
    setSelectedMessage,
    setSelectedMessageIds,
    setSettledMessageId,
    setSidebarWidth,
    setSyncLoading,
    setUser,
    settingsOpen,
    settledMessageId,
    sidebarWidth,
    storedComposeDraft,
    syncLoading,
    unreadOnly,
    user,
  }
}

export type MailPresentationState = ReturnType<typeof useMailPresentationState>
