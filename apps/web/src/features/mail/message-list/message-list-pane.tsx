import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import IconAlertCircle from "@tabler/icons-react/dist/esm/icons/IconAlertCircle.mjs"
import IconCheck from "@tabler/icons-react/dist/esm/icons/IconCheck.mjs"
import IconInbox from "@tabler/icons-react/dist/esm/icons/IconInbox.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconRefresh from "@tabler/icons-react/dist/esm/icons/IconRefresh.mjs"
import IconX from "@tabler/icons-react/dist/esm/icons/IconX.mjs"
import {
  MailMessageListBody,
  MailMessageListFrame,
  MailPaneState as PaneState,
} from "@workspace/mail-design"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { MessageListPagination } from "./message-list-pagination"
import {
  MessageContextMenu,
  MessageListItemRow,
  MessageListLoadingRow,
  ServiceWorkerUpdateListRow,
} from "./message-list-rows"
import { MessageListToolbar } from "./message-list-toolbar"
import type {
  MessageListPaneProps,
  VisibleMessageListPosition,
} from "./message-list-types"
import { PushPermissionPrompt } from "./push-permission-prompt"
import { usePullToRefresh } from "./use-pull-to-refresh"
import type { MessageListItemDto } from "@/lib/api-client"

export const MessageListPane = React.memo(function MessageListPane({
  accountLabelById,
  accounts,
  allMessagesSelected,
  allSelectedFlagged,
  canGoToNextMessageListPage,
  canGoToPreviousMessageListPage,
  currentMessageListPage,
  customFoldersOnly,
  errorMessage,
  flaggedOnly,
  mailboxesByAccount,
  listScopeKey,
  lastMessageListPage,
  messageListPageNumbers,
  messages,
  messagesLoading,
  moreLoading,
  offlineStatusActive,
  pushLoading,
  pushPromptVisible,
  pushState,
  pushStatusMessage,
  profiles,
  requestedMessageListPage,
  restoredMessageListPosition,
  searchActive: searchActiveFromRoute,
  searchHasCriteria,
  searchIndexIncomplete,
  searchScopeLabel,
  searchValue,
  serviceWorkerUpdateAvailable,
  serviceWorkerUpdating,
  selectedAccountId,
  selectedMailboxPath,
  selectedMessageCount,
  selectedMessageId,
  selectedMessageIds,
  selectedProfileId,
  selectedSpecialUse,
  selectedUnreadCount,
  syncLoading,
  unreadMessageCount,
  unreadOnly,
  preloadComposePanel,
  onMessageClick,
  onMessageListPageChange,
  onMessageListPageRequest,
  onMoveCheckedMessagesToSpecial,
  onDismissPushPrompt,
  onDismissPushStatusMessage,
  onEnablePushNotifications,
  onOpenComposer,
  onOpenSearch,
  onCloseSearch,
  onOpenMessage,
  onOpenMobileSidebar,
  onSearchValueChange,
  onApplyServiceWorkerUpdate,
  onDismissServiceWorkerUpdate,
  onSelectAccountMailbox,
  onSelectCustomFolders,
  onSelectProfileSection,
  onSelectSection,
  onSyncLocal,
  onToggleAllMessagesSelection,
  onToggleMessageFlagged,
  onToggleMessageSelection,
  onToggleUnreadOnly,
  onMoveMessageToSpecial,
  onUpdateMessageFlags,
  onUpdateCheckedMessageFlags,
  onVisibleMessageListPositionChange,
}: MessageListPaneProps) {
  const { t } = useMailLocale()

  const paneRef = React.useRef<HTMLElement | null>(null)
  const listParentRef = React.useRef<HTMLDivElement | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement | null>(null)
  const visibleMessageListAnchorRef = React.useRef<VisibleMessageListPosition>({
    page: restoredMessageListPosition?.currentPage ?? currentMessageListPage,
    anchorMessageId: restoredMessageListPosition?.anchorMessageId ?? null,
    anchorOffset: restoredMessageListPosition?.anchorOffset ?? 0,
  })
  const previousMessageListWindowKeyRef = React.useRef<string | null>(null)
  const previousFirstPageMessageIdsRef = React.useRef<Set<string> | null>(null)
  const messageListStartPendingRef = React.useRef(false)
  const previousListScopeKeyRef = React.useRef(listScopeKey)
  const latestLoadedMessagesRef = React.useRef(messages)
  const windowAnchorRestorePendingRef = React.useRef(false)
  const appliedRestoreTimestampRef = React.useRef<string | null>(null)
  const [searchActive, setSearchActive] = React.useState(searchActiveFromRoute)
  const [messageContextMenu, setMessageContextMenu] = React.useState<{
    message: MessageListItemDto
    x: number
    y: number
  } | null>(null)
  if (!messagesLoading) {
    latestLoadedMessagesRef.current = messages
  }
  const renderedMessages =
    messagesLoading && messages.length === 0
      ? latestLoadedMessagesRef.current
      : messages
  const backgroundRefreshPending =
    messagesLoading && renderedMessages.length > 0
  const serviceWorkerUpdateRowOffset = serviceWorkerUpdateAvailable ? 1 : 0
  const messageListPaginationItems = React.useMemo(
    () =>
      getMessageListPaginationPageNumbers(
        currentMessageListPage,
        lastMessageListPage
      ),
    [currentMessageListPage, lastMessageListPage]
  )

  React.useEffect(() => {
    setSearchActive(searchActiveFromRoute)
  }, [searchActiveFromRoute])

  React.useEffect(() => {
    if (!searchActive) return

    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [searchActive])

  React.useLayoutEffect(() => {
    if (previousListScopeKeyRef.current === listScopeKey) {
      return
    }

    previousListScopeKeyRef.current = listScopeKey
    previousMessageListWindowKeyRef.current = null
    previousFirstPageMessageIdsRef.current = null
    messageListStartPendingRef.current = false
    windowAnchorRestorePendingRef.current = false
    appliedRestoreTimestampRef.current = null
    visibleMessageListAnchorRef.current = {
      page: 1,
      anchorMessageId: null,
      anchorOffset: 0,
    }
    setMessageContextMenu(null)

    if (listParentRef.current) {
      listParentRef.current.scrollTop = 0
    }
  }, [listScopeKey])

  const { pullDistance, pullReady } = usePullToRefresh({
    disabled: messagesLoading || syncLoading,
    gestureElementRef: paneRef,
    scrollElementRef: listParentRef,
    onRefresh: onSyncLocal,
  })
  const virtualizer = useVirtualizer({
    count:
      serviceWorkerUpdateRowOffset +
      renderedMessages.length +
      (moreLoading ? 1 : 0),
    getScrollElement: () => listParentRef.current,
    getItemKey: (index) =>
      serviceWorkerUpdateAvailable && index === 0
        ? "service-worker-update"
        : (renderedMessages[index - serviceWorkerUpdateRowOffset]?.id ??
          "next-page-loader"),
    estimateSize: () => 92,
    overscan: 8,
  })
  const virtualItems = virtualizer.getVirtualItems()

  React.useLayoutEffect(() => {
    const firstPageMessageIds = renderedMessages.flatMap((message, index) =>
      messageListPageNumbers[index] === 1 ? [message.id] : []
    )
    const previousMessageIds = previousFirstPageMessageIdsRef.current

    previousFirstPageMessageIdsRef.current = new Set(firstPageMessageIds)

    const newestMessageId = firstPageMessageIds[0]
    if (
      previousMessageIds === null ||
      !newestMessageId ||
      previousMessageIds.has(newestMessageId) ||
      currentMessageListPage !== 1
    ) {
      return
    }

    const position = {
      page: 1,
      anchorMessageId: newestMessageId,
      anchorOffset: 0,
    }
    const scrollElement = listParentRef.current

    messageListStartPendingRef.current = true
    visibleMessageListAnchorRef.current = position
    onVisibleMessageListPositionChange(position)
    virtualizer.scrollToIndex(serviceWorkerUpdateRowOffset, { align: "start" })

    if (scrollElement) {
      scrollElement.scrollTop = 0
    }

    const frameId = window.requestAnimationFrame(() => {
      if (listParentRef.current === scrollElement && scrollElement) {
        scrollElement.scrollTop = 0
      }
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [
    currentMessageListPage,
    messageListPageNumbers,
    onVisibleMessageListPositionChange,
    renderedMessages,
    serviceWorkerUpdateRowOffset,
    virtualizer,
  ])

  React.useEffect(() => {
    if (!messageListStartPendingRef.current || currentMessageListPage !== 1) {
      return
    }

    const scrollElement = listParentRef.current

    virtualizer.scrollToOffset(0)
    if (scrollElement) {
      scrollElement.scrollTop = 0
    }

    if (moreLoading) {
      return
    }

    let finalFrameId: number | null = null
    const settleFrameId = window.requestAnimationFrame(() => {
      finalFrameId = window.requestAnimationFrame(() => {
        if (listParentRef.current === scrollElement && scrollElement) {
          scrollElement.scrollTop = 0
        }
        messageListStartPendingRef.current = false
      })
    })

    return () => {
      window.cancelAnimationFrame(settleFrameId)
      if (finalFrameId !== null) {
        window.cancelAnimationFrame(finalFrameId)
      }
    }
  }, [
    currentMessageListPage,
    messageListPageNumbers,
    moreLoading,
    renderedMessages,
    virtualizer,
  ])

  const handleListScroll = React.useCallback(() => {
    setMessageContextMenu(null)

    if (messageListStartPendingRef.current) {
      return
    }

    const scrollElement = listParentRef.current
    const firstVisibleItem = virtualizer.getVirtualItems().find((item) => {
      const messageIndex = item.index - serviceWorkerUpdateRowOffset
      return (
        messageIndex >= 0 &&
        messageIndex < renderedMessages.length &&
        item.end > (scrollElement?.scrollTop ?? 0)
      )
    })

    if (firstVisibleItem) {
      const messageIndex = firstVisibleItem.index - serviceWorkerUpdateRowOffset
      const position = {
        page: messageListPageNumbers[messageIndex] ?? currentMessageListPage,
        anchorMessageId: renderedMessages[messageIndex]?.id ?? null,
        anchorOffset: Math.max(
          0,
          (scrollElement?.scrollTop ?? 0) - firstVisibleItem.start
        ),
      }

      visibleMessageListAnchorRef.current = position
      onVisibleMessageListPositionChange(position)
    }
  }, [
    currentMessageListPage,
    messageListPageNumbers,
    renderedMessages,
    onVisibleMessageListPositionChange,
    serviceWorkerUpdateRowOffset,
    virtualizer,
  ])

  React.useLayoutEffect(() => {
    const messageListWindowKey = [...new Set(messageListPageNumbers)].join("|")
    const restoreTimestamp = restoredMessageListPosition?.updatedAt ?? null
    const restoringSavedPosition =
      restoreTimestamp !== null &&
      appliedRestoreTimestampRef.current !== restoreTimestamp
    const windowShifted =
      previousMessageListWindowKeyRef.current !== null &&
      previousMessageListWindowKeyRef.current !== messageListWindowKey

    if (windowShifted) {
      windowAnchorRestorePendingRef.current = true
    }

    previousMessageListWindowKeyRef.current = messageListWindowKey

    if (!restoringSavedPosition && !windowAnchorRestorePendingRef.current) {
      return
    }

    if (restoringSavedPosition && restoredMessageListPosition) {
      visibleMessageListAnchorRef.current = {
        page: restoredMessageListPosition.currentPage,
        anchorMessageId: restoredMessageListPosition.anchorMessageId,
        anchorOffset: restoredMessageListPosition.anchorOffset,
      }
    }

    const anchor = visibleMessageListAnchorRef.current
    const exactAnchorIndex = anchor.anchorMessageId
      ? renderedMessages.findIndex(
          (message) => message.id === anchor.anchorMessageId
        )
      : -1
    const anchorIndex =
      exactAnchorIndex >= 0
        ? exactAnchorIndex
        : messageListPageNumbers.findIndex((page) => page === anchor.page)
    const firstPageIndex = messageListPageNumbers.findIndex(
      (page) => page === 1
    )

    if (anchorIndex < 0) {
      return
    }

    const anchorIsMessageListStart =
      anchor.page === 1 &&
      anchorIndex === firstPageIndex &&
      anchor.anchorOffset === 0

    windowAnchorRestorePendingRef.current = false
    if (restoringSavedPosition) {
      appliedRestoreTimestampRef.current = restoreTimestamp
    }

    if (anchorIsMessageListStart) {
      virtualizer.scrollToOffset(0)
    } else {
      virtualizer.scrollToIndex(anchorIndex + serviceWorkerUpdateRowOffset, {
        align: "start",
      })
    }
    const frameId = window.requestAnimationFrame(() => {
      const scrollElement = listParentRef.current

      if (scrollElement && anchorIsMessageListStart) {
        scrollElement.scrollTop = 0
      } else if (
        scrollElement &&
        exactAnchorIndex >= 0 &&
        anchor.anchorOffset > 0
      ) {
        scrollElement.scrollTop += anchor.anchorOffset
      }
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [
    messageListPageNumbers,
    renderedMessages,
    restoredMessageListPosition,
    serviceWorkerUpdateRowOffset,
    virtualizer,
  ])

  const openMessageContextMenu = React.useCallback(
    (
      message: MessageListItemDto,
      event: React.MouseEvent<HTMLButtonElement>
    ) => {
      event.preventDefault()
      event.stopPropagation()
      setMessageContextMenu({
        message,
        x: clamp(event.clientX, 8, Math.max(8, window.innerWidth - 260)),
        y: clamp(event.clientY, 8, Math.max(8, window.innerHeight - 260)),
      })
    },
    []
  )

  const closeMessageContextMenu = React.useCallback(() => {
    setMessageContextMenu(null)
  }, [])

  React.useEffect(() => {
    if (!messageContextMenu) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMessageContextMenu(null)
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [messageContextMenu])

  const scrollToMessageListPage = React.useCallback(
    (page: number) => {
      const targetIndex = messageListPageNumbers.findIndex(
        (pageNumber) => pageNumber === page
      )

      if (targetIndex < 0) {
        return
      }

      const position = {
        page,
        anchorMessageId: renderedMessages[targetIndex]?.id ?? null,
        anchorOffset: 0,
      }

      if (page === 1) {
        messageListStartPendingRef.current = true
      }

      visibleMessageListAnchorRef.current = position
      onMessageListPageChange(page)
      onVisibleMessageListPositionChange(position)
      virtualizer.scrollToIndex(targetIndex + serviceWorkerUpdateRowOffset, {
        align: "start",
      })

      if (page === 1) {
        const scrollElement = listParentRef.current

        if (scrollElement) {
          scrollElement.scrollTop = 0
        }

        window.requestAnimationFrame(() => {
          if (listParentRef.current === scrollElement && scrollElement) {
            scrollElement.scrollTop = 0
          }
        })
      }
    },
    [
      messageListPageNumbers,
      renderedMessages,
      onMessageListPageChange,
      onVisibleMessageListPositionChange,
      serviceWorkerUpdateRowOffset,
      virtualizer,
    ]
  )

  React.useLayoutEffect(() => {
    if (
      requestedMessageListPage === null ||
      !messageListPageNumbers.includes(requestedMessageListPage)
    ) {
      return
    }

    scrollToMessageListPage(requestedMessageListPage)
    onMessageListPageRequest(null)
  }, [
    messageListPageNumbers,
    onMessageListPageRequest,
    requestedMessageListPage,
    scrollToMessageListPage,
  ])

  const handlePaginationPageClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, page: number) => {
      event.preventDefault()

      if (messageListPageNumbers.includes(page)) {
        onMessageListPageRequest(null)
        scrollToMessageListPage(page)
        return
      }

      onMessageListPageRequest(page)
    },
    [messageListPageNumbers, onMessageListPageRequest, scrollToMessageListPage]
  )

  const handlePaginationClick = React.useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      page: number,
      enabled: boolean
    ) => {
      event.preventDefault()

      if (!enabled) {
        return
      }

      scrollToMessageListPage(page)
    },
    [scrollToMessageListPage]
  )

  return (
    <MailMessageListFrame
      className={cn(
        "flex h-svh min-h-0 flex-col overflow-hidden bg-[#f8fafb] dark:bg-[#131619]",
        selectedMessageId && "hidden lg:flex"
      )}
      ref={paneRef}
    >
      <MessageListToolbar
        accounts={accounts}
        allMessagesSelected={allMessagesSelected}
        allSelectedFlagged={allSelectedFlagged}
        customFoldersOnly={customFoldersOnly}
        flaggedOnly={flaggedOnly}
        mailboxesByAccount={mailboxesByAccount}
        messagesCount={messages.length}
        offlineStatusActive={offlineStatusActive}
        profiles={profiles}
        searchActive={searchActive}
        searchActiveFromRoute={searchActiveFromRoute}
        searchIndexIncomplete={searchIndexIncomplete}
        searchInputRef={searchInputRef}
        searchScopeLabel={searchScopeLabel}
        searchValue={searchValue}
        selectedAccountId={selectedAccountId}
        selectedMailboxPath={selectedMailboxPath}
        selectedMessageCount={selectedMessageCount}
        selectedProfileId={selectedProfileId}
        selectedSpecialUse={selectedSpecialUse}
        selectedUnreadCount={selectedUnreadCount}
        syncLoading={syncLoading}
        unreadMessageCount={unreadMessageCount}
        unreadOnly={unreadOnly}
        preloadComposePanel={preloadComposePanel}
        onActivateSearch={() => {
          setSearchActive(true)
          onOpenSearch()
        }}
        onCloseSearch={() => {
          onCloseSearch()
          setSearchActive(false)
        }}
        onMoveCheckedMessagesToSpecial={onMoveCheckedMessagesToSpecial}
        onOpenComposer={onOpenComposer}
        onOpenMobileSidebar={onOpenMobileSidebar}
        onSearchValueChange={onSearchValueChange}
        onSelectAccountMailbox={onSelectAccountMailbox}
        onSelectCustomFolders={onSelectCustomFolders}
        onSelectProfileSection={onSelectProfileSection}
        onSelectSection={onSelectSection}
        onSyncLocal={onSyncLocal}
        onToggleAllMessagesSelection={onToggleAllMessagesSelection}
        onToggleUnreadOnly={onToggleUnreadOnly}
        onUpdateCheckedMessageFlags={onUpdateCheckedMessageFlags}
      />
      {offlineStatusActive && !searchActive ? (
        <p role="status" className="px-4 py-2 text-xs text-muted-foreground">
          {t(
            "Показаны сохранённые письма. Список может быть неполным.",
            "Showing saved messages. The list may be incomplete."
          )}
        </p>
      ) : null}
      {pushPromptVisible && !offlineStatusActive ? (
        <PushPermissionPrompt
          loading={pushLoading}
          state={pushState}
          onDismiss={onDismissPushPrompt}
          onEnable={() => void onEnablePushNotifications()}
        />
      ) : null}

      {pushStatusMessage ? (
        <div className="mx-4 my-4 flex items-start gap-2 border border-[#9fcfbd] bg-[#effaf5] p-3 text-sm text-[#1f6f56] dark:border-[#2f6f5c] dark:bg-[#14231d] dark:text-[#8de1c2]">
          <IconCheck className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">{pushStatusMessage}</span>
          <Button
            aria-label={t(
              "Скрыть уведомление о push-уведомлениях",
              "Dismiss push notification notice"
            )}
            className="-mt-1 -mr-1 text-[#1f6f56] hover:bg-[#d8f2e7] hover:text-[#155b46] dark:text-[#8de1c2] dark:hover:bg-[#1f3a30] dark:hover:text-[#baf4df]"
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={onDismissPushStatusMessage}
          >
            <IconX className="size-4" />
          </Button>
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mx-4 my-4 flex items-start gap-2 border border-[#e6b8b0] bg-[#fff4f1] p-3 text-sm text-[#963828] dark:border-[#6c3a33] dark:bg-[#281d1b] dark:text-[#ffb3a7]">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            {searchActive
              ? t(
                  "Не удалось выполнить поиск. Проверьте соединение и попробуйте ещё раз.",
                  "Search failed. Check your connection and try again."
                )
              : errorMessage}
          </span>
          {searchActive ? (
            <Button
              className="shrink-0"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => void onSyncLocal()}
            >
              {t("Повторить", "Try again")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <MailMessageListBody
        aria-busy={messagesLoading}
        className="custom-scrollbar min-h-0 flex-1 overflow-auto"
        ref={listParentRef}
        onScroll={handleListScroll}
      >
        {pullDistance > 0 ? (
          <div
            aria-hidden="true"
            className="pointer-events-none sticky top-2 z-10 flex h-0 justify-center overflow-visible"
            style={{
              opacity: Math.min(1, pullDistance / 48),
            }}
          >
            <span
              className={cn(
                "grid size-9 place-items-center rounded-full border border-[#d8dee5] bg-white text-[#68727d] shadow-[0_8px_24px_rgba(20,28,36,0.14)] dark:border-[#30353a] dark:bg-[#181b1f] dark:text-[#a7b0ba]",
                pullReady &&
                  "border-[#1f8a70]/50 text-[#1f8a70] dark:border-[#7ed8bf]/50 dark:text-[#7ed8bf]"
              )}
              style={{
                transform: `translateY(${pullDistance}px) rotate(${pullDistance * 4}deg)`,
              }}
            >
              <IconRefresh className="size-4" />
            </span>
          </div>
        ) : null}
        {backgroundRefreshPending ? (
          <div
            aria-hidden="true"
            className="pointer-events-none sticky top-2 z-20 flex h-0 justify-end pr-2"
          >
            <span className="grid size-8 place-items-center rounded-full border border-[#d8dee5] bg-white/95 text-[#68727d] shadow-[0_6px_18px_rgba(20,28,36,0.12)] dark:border-[#30353a] dark:bg-[#181b1f]/95 dark:text-[#a7b0ba]">
              <IconLoader2 className="size-4 animate-spin" />
            </span>
          </div>
        ) : null}
        {messagesLoading && renderedMessages.length === 0 ? (
          <PaneState icon={<IconLoader2 className="size-5 animate-spin" />}>
            {searchActive && searchHasCriteria
              ? t("Ищем письма…", "Searching messages…")
              : t("Загружаем письма…", "Loading messages…")}
          </PaneState>
        ) : !messagesLoading && messages.length === 0 ? (
          <PaneState icon={<IconInbox className="size-5" />}>
            {offlineStatusActive
              ? t(
                  "Среди сохранённых писем совпадений нет",
                  "No matches in saved messages"
                )
              : searchActive && searchHasCriteria
                ? t(
                    "Писем по этому запросу нет",
                    "No messages match this search"
                  )
                : t(
                    "Писем по текущему фильтру нет",
                    "No messages match the current filter"
                  )}
          </PaneState>
        ) : (
          <div
            aria-hidden={backgroundRefreshPending || undefined}
            className="relative w-full"
            inert={backgroundRefreshPending || undefined}
            style={{
              height: virtualizer.getTotalSize(),
            }}
          >
            {virtualItems.map((virtualItem) => {
              if (serviceWorkerUpdateAvailable && virtualItem.index === 0) {
                return (
                  <ServiceWorkerUpdateListRow
                    height={virtualItem.size}
                    key={virtualItem.key}
                    loading={serviceWorkerUpdating}
                    start={virtualItem.start}
                    onDismiss={onDismissServiceWorkerUpdate}
                    onRefresh={onApplyServiceWorkerUpdate}
                  />
                )
              }

              const message =
                renderedMessages[
                  virtualItem.index - serviceWorkerUpdateRowOffset
                ]

              if (!message) {
                return (
                  <MessageListLoadingRow
                    height={virtualItem.size}
                    key={virtualItem.key}
                    loading={moreLoading}
                    start={virtualItem.start}
                  />
                )
              }

              return (
                <MessageListItemRow
                  accountLabel={
                    message.accountId
                      ? (accountLabelById.get(message.accountId) ??
                        message.accountId)
                      : t("Аккаунт", "Account")
                  }
                  height={virtualItem.size}
                  isActive={message.id === selectedMessageId}
                  isChecked={selectedMessageIds.has(message.id)}
                  key={virtualItem.key}
                  message={message}
                  start={virtualItem.start}
                  onClick={onMessageClick}
                  onContextMenu={openMessageContextMenu}
                  onToggleFlagged={onToggleMessageFlagged}
                  onToggleSelection={onToggleMessageSelection}
                />
              )
            })}
          </div>
        )}
      </MailMessageListBody>

      {messageContextMenu ? (
        <MessageContextMenu
          message={messageContextMenu.message}
          x={messageContextMenu.x}
          y={messageContextMenu.y}
          onClose={closeMessageContextMenu}
          onMoveToSpecial={(message, specialUse) =>
            void onMoveMessageToSpecial(message, specialUse)
          }
          onOpen={(message) => {
            closeMessageContextMenu()
            onOpenMessage(message)
          }}
          onToggleFlagged={(message) => void onToggleMessageFlagged(message)}
          onToggleSeen={(message) =>
            void onUpdateMessageFlags(message.id, {
              seen: !message.seen,
            })
          }
          onToggleSelection={onToggleMessageSelection}
        />
      ) : null}

      <MessageListPagination
        canGoToNextPage={canGoToNextMessageListPage}
        canGoToPreviousPage={canGoToPreviousMessageListPage}
        currentPage={currentMessageListPage}
        loadingMore={moreLoading}
        pageNumbers={messageListPaginationItems}
        requestedPage={requestedMessageListPage}
        onNavigate={handlePaginationClick}
        onSelectPage={handlePaginationPageClick}
      />
    </MailMessageListFrame>
  )
})

function getMessageListPaginationPageNumbers(
  currentPage: number,
  lastPage: number | null
) {
  const pageNumbers =
    currentPage < 5
      ? [1, 2, 3, 4, 5]
      : [1, currentPage - 1, currentPage, currentPage + 1]

  return pageNumbers.filter(
    (pageNumber) => lastPage === null || pageNumber <= lastPage
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
