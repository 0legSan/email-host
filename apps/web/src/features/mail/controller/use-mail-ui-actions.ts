/* eslint-disable react-hooks/exhaustive-deps -- composed controller contexts expose stable React setters and refs that the rule cannot infer. */
import * as React from "react"
import { useEvent } from "@/features/mail/message-list/use-pull-to-refresh"
import { type MessageListItemDto } from "@/lib/api-client"
import { markPerformance, measurePerformance } from "@/lib/performance"
import {
  mailSearchFiltersChanged,
  mailSearchValueToRoutePatch,
  type MailSearchValue,
} from "@/lib/mail-search"
import {
  handleBackgroundRequestError,
  handleRequestError,
  isMobileViewport,
} from "./mail-controller-helpers"
import type { MailMessageActionsContext } from "./use-mail-message-actions"

export function useMailUiActions(context: MailMessageActionsContext) {
  const {
    closeMobileSidebar,
    downloadAttachment,
    handleForward,
    handleReply,
    handleSyncLocal,
    invalidateMailCaches,
    messageIframeResizeCleanupRef,
    messages,
    moveCheckedMessagesToSpecial,
    moveMessageListItemToSpecial,
    moveSelectedMessageToCustomFolder,
    moveSelectedMessageToSpecial,
    navigateToMessage,
    openComposer,
    routeSearch,
    saveProfileAccountOrder,
    saveSidebarOrder,
    selectAccountMailbox,
    selectCustomFolders,
    selectFlaggedAccount,
    selectProfileSection,
    selectSection,
    selectedMessageIds,
    setAuthStatus,
    setErrorMessage,
    setMessageIframeHeight,
    setSearchInput,
    setSelectedMessageIds,
    toggleMessageFlagged,
    toggleSection,
    unreadOnly,
    updateCheckedMessageFlags,
    updateCurrentRouteSearch,
    updateMessageFlags,
  } = context
  function selectMessage(message: MessageListItemDto) {
    if (!message.seen) {
      void updateMessageFlags(message.id, {
        seen: true,
      })
        .then(() => {
          markPerformance("read-status-patch-finished")
          measurePerformance(
            "message-tap-to-read-patch-finished",
            "message-tap",
            "read-status-patch-finished"
          )
        })
        .catch((error) => {
          handleBackgroundRequestError(error, setAuthStatus)
        })
    }

    navigateToMessage(message.id)
  }
  function resizeMessageIframe(iframe: HTMLIFrameElement) {
    let iframeDocument: Document | null

    try {
      iframeDocument = iframe.contentDocument
    } catch {
      return
    }

    if (!iframeDocument) {
      return
    }

    const emailRoot = iframeDocument.querySelector<HTMLElement>(".email-root")
    const height = Math.max(
      560,
      emailRoot?.scrollHeight ?? 0,
      emailRoot?.getBoundingClientRect().height ?? 0,
      iframeDocument.documentElement.scrollHeight,
      iframeDocument.body.scrollHeight
    )
    const nextHeight = Math.ceil(height)

    setMessageIframeHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight
    )
  }
  function observeMessageIframeSize(
    iframe: HTMLIFrameElement,
    remainingAttempts = 20
  ) {
    messageIframeResizeCleanupRef.current?.()
    messageIframeResizeCleanupRef.current = null

    const scheduleObservationRetry = () => {
      if (remainingAttempts <= 0) {
        return false
      }

      // The initial about:blank load can replace the document while the parent
      // layout effect is attaching, so .email-root may appear on a later tick.
      const timeoutId = window.setTimeout(
        () => observeMessageIframeSize(iframe, remainingAttempts - 1),
        50
      )
      messageIframeResizeCleanupRef.current = () => {
        window.clearTimeout(timeoutId)
      }
      return false
    }

    let iframeDocument: Document | null

    try {
      iframeDocument = iframe.contentDocument
    } catch {
      return scheduleObservationRetry()
    }

    const emailRoot =
      iframeDocument?.querySelector<HTMLElement>(".email-root") ?? null

    if (!iframeDocument || !emailRoot) {
      return scheduleObservationRetry()
    }

    const observedElements = [
      iframeDocument.documentElement,
      iframeDocument.body,
      emailRoot,
    ].filter((element): element is HTMLElement => Boolean(element))
    const imageElements = Array.from(iframeDocument.images)
    const timeoutIds: number[] = []
    let animationFrameId: number | null = null

    const scheduleResize = () => {
      if (animationFrameId !== null) {
        return
      }

      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null
        resizeMessageIframe(iframe)
      })
    }

    const resizeObserver =
      "ResizeObserver" in window ? new ResizeObserver(scheduleResize) : null

    for (const element of observedElements) {
      resizeObserver?.observe(element)
    }

    for (const image of imageElements) {
      image.addEventListener("load", scheduleResize)
      image.addEventListener("error", scheduleResize)
    }

    void iframeDocument.fonts?.ready.then(scheduleResize).catch(() => undefined)

    for (const delayMs of [50, 200, 700, 1_500, 3_000]) {
      timeoutIds.push(window.setTimeout(scheduleResize, delayMs))
    }

    scheduleResize()

    messageIframeResizeCleanupRef.current = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }

      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId)
      }

      resizeObserver?.disconnect()

      for (const image of imageElements) {
        image.removeEventListener("load", scheduleResize)
        image.removeEventListener("error", scheduleResize)
      }
    }

    return true
  }
  function handleMessageIframeLoad(
    event: React.SyntheticEvent<HTMLIFrameElement>
  ) {
    observeMessageIframeSize(event.currentTarget)
  }
  function toggleMessageSelection(messageId: string) {
    setSelectedMessageIds((currentMessageIds) => {
      const nextMessageIds = new Set(currentMessageIds)

      if (nextMessageIds.has(messageId)) {
        nextMessageIds.delete(messageId)
      } else {
        nextMessageIds.add(messageId)
      }

      return nextMessageIds
    })
  }
  function toggleAllMessagesSelection() {
    setSelectedMessageIds((currentMessageIds) => {
      const unreadMessages = messages.filter((message) => !message.seen)
      const selectedAllUnread =
        unreadMessages.length > 0 &&
        unreadMessages.every((message) => currentMessageIds.has(message.id))
      const selectedAllLoaded =
        messages.length > 0 &&
        messages.every((message) => currentMessageIds.has(message.id))

      if (!selectedAllUnread && unreadMessages.length > 0) {
        return new Set(unreadMessages.map((message) => message.id))
      }

      return selectedAllLoaded
        ? new Set()
        : new Set(messages.map((message) => message.id))
    })
  }
  const handleMessageListItemClick = useEvent(
    (
      message: MessageListItemDto,
      event: React.MouseEvent<HTMLButtonElement>
    ) => {
      markPerformance("message-tap")

      if (event.shiftKey) {
        toggleMessageSelection(message.id)
        return
      }

      if (selectedMessageIds.size > 0 && isMobileViewport()) {
        toggleMessageSelection(message.id)
        return
      }

      void selectMessage(message)
    }
  )
  const sidebarCloseMobileSidebar = useEvent(closeMobileSidebar)
  const sidebarInvalidateMailCaches = useEvent(invalidateMailCaches)
  const sidebarSelectAccountMailbox = useEvent(selectAccountMailbox)
  const sidebarSelectCustomFolders = useEvent(selectCustomFolders)
  const sidebarSelectFlaggedAccount = useEvent(selectFlaggedAccount)
  const sidebarSelectProfileSection = useEvent(selectProfileSection)
  const sidebarSelectSection = useEvent(selectSection)
  const sidebarSaveProfileAccountOrder = useEvent(saveProfileAccountOrder)
  const sidebarSaveSidebarOrder = useEvent(saveSidebarOrder)
  const sidebarToggleSection = useEvent(toggleSection)
  const readerHandleReply = useEvent(handleReply)
  const readerHandleForward = useEvent(handleForward)
  const readerUpdateMessageFlags = useEvent(updateMessageFlags)
  const readerMoveSelectedMessageToSpecial = useEvent(
    moveSelectedMessageToSpecial
  )
  const readerMoveSelectedMessageToCustomFolder = useEvent(
    moveSelectedMessageToCustomFolder
  )
  const readerDownloadAttachment = useEvent(downloadAttachment)
  const readerHandleMessageIframeLoad = useEvent(handleMessageIframeLoad)
  const listOpenMobileSidebar = React.useCallback(() => {
    updateCurrentRouteSearch({
      drawer: "menu",
    })
  }, [updateCurrentRouteSearch])
  const listHandleSearchValueChange = React.useCallback(
    (value: MailSearchValue) => {
      setSearchInput(value.text)

      if (
        !routeSearch.searchMode ||
        mailSearchFiltersChanged(value, routeSearch)
      ) {
        updateCurrentRouteSearch(mailSearchValueToRoutePatch(value), true)
      }
    },
    [routeSearch, updateCurrentRouteSearch]
  )
  const listOpenSearch = React.useCallback(() => {
    updateCurrentRouteSearch({ searchMode: true }, true)
  }, [updateCurrentRouteSearch])
  const listCloseSearch = React.useCallback(() => {
    setSearchInput("")
    updateCurrentRouteSearch(
      {
        after: null,
        before: null,
        from: null,
        hasAttachments: null,
        q: null,
        searchFlagged: null,
        searchMode: null,
        searchUnread: null,
        subject: null,
        to: null,
      },
      true
    )
  }, [updateCurrentRouteSearch])
  const listToggleUnreadOnly = React.useCallback(() => {
    updateCurrentRouteSearch({
      unread: unreadOnly ? null : true,
    })
  }, [unreadOnly, updateCurrentRouteSearch])
  const listOpenComposer = useEvent(() => openComposer())
  const listOpenMessage = useEvent((message: MessageListItemDto) => {
    markPerformance("message-tap")
    void selectMessage(message)
  })
  const listToggleAllMessagesSelection = useEvent(toggleAllMessagesSelection)
  const listToggleMessageSelection = useEvent((message: MessageListItemDto) => {
    toggleMessageSelection(message.id)
  })
  const listUpdateCheckedMessageFlags = useEvent(updateCheckedMessageFlags)
  const listToggleMessageFlagged = useEvent(toggleMessageFlagged)
  const listUpdateMessageFlags = useEvent(
    async (
      messageId: string,
      flags: {
        seen?: boolean
        flagged?: boolean
      }
    ) => {
      try {
        await updateMessageFlags(messageId, flags)
      } catch (error) {
        handleRequestError(error, setErrorMessage, setAuthStatus)
      }
    }
  )
  const listMoveCheckedMessagesToSpecial = useEvent(
    moveCheckedMessagesToSpecial
  )
  const listMoveMessageToSpecial = useEvent(moveMessageListItemToSpecial)
  const listHandleSyncLocal = useEvent(handleSyncLocal)

  return {
    handleMessageIframeLoad,
    handleMessageListItemClick,
    listCloseSearch,
    listHandleSearchValueChange,
    listHandleSyncLocal,
    listMoveCheckedMessagesToSpecial,
    listMoveMessageToSpecial,
    listOpenComposer,
    listOpenMessage,
    listOpenMobileSidebar,
    listOpenSearch,
    listToggleAllMessagesSelection,
    listToggleMessageFlagged,
    listToggleMessageSelection,
    listToggleUnreadOnly,
    listUpdateCheckedMessageFlags,
    listUpdateMessageFlags,
    observeMessageIframeSize,
    readerDownloadAttachment,
    readerHandleForward,
    readerHandleMessageIframeLoad,
    readerHandleReply,
    readerMoveSelectedMessageToCustomFolder,
    readerMoveSelectedMessageToSpecial,
    readerUpdateMessageFlags,
    resizeMessageIframe,
    selectMessage,
    sidebarCloseMobileSidebar,
    sidebarInvalidateMailCaches,
    sidebarSaveProfileAccountOrder,
    sidebarSaveSidebarOrder,
    sidebarSelectAccountMailbox,
    sidebarSelectCustomFolders,
    sidebarSelectFlaggedAccount,
    sidebarSelectProfileSection,
    sidebarSelectSection,
    sidebarToggleSection,
    toggleAllMessagesSelection,
    toggleMessageSelection,
  }
}

export type MailUiActionsContext = MailMessageActionsContext &
  ReturnType<typeof useMailUiActions>
