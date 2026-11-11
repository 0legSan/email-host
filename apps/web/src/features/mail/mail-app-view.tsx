import { localizeRequestErrorText } from "@/lib/request-error-text"
import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import IconGripVertical from "@tabler/icons-react/dist/esm/icons/IconGripVertical.mjs"
import { MailSessionChecking, MailWorkspace } from "@workspace/mail-design"
import { LoginForm } from "@workspace/mail-design/auth"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import type { useMailController } from "@/features/mail/controller/use-mail-controller"
import { setConvexSessionAuthenticated } from "@/lib/convex-session"
import { apiFetch, type UserDto } from "@/lib/api-client"
import { canRegisterMailtoHandler } from "@/lib/mailto-protocol-handler"
import { MailSidebar } from "@/features/mail/sidebar/mail-sidebar"
import { MessageListPane } from "@/features/mail/message-list/message-list-pane"
import { MessageReaderPane } from "@/features/mail/reader/message-reader-pane"
import {
  ComposePanel,
  LazyPanelFallback,
  SettingsPanel,
  preloadComposePanel,
  preloadSettingsPanel,
} from "@/features/mail/lazy-mail-panels"

type MailController = ReturnType<typeof useMailController>
const defaultLoginEmail = "owner@mail.localhost"

export function MailAppView({ controller }: { controller: MailController }) {
  const { t } = useMailLocale()

  const {
    accountLabelById,
    accounts,
    accountsLoading,
    activeMessageListNavigation,
    activeMessageThread,
    activeSelectedMessage,
    allMessagesSelected,
    allSelectedFlagged,
    applyMailPreferences,
    applyServiceWorkerUpdate,
    authStatus,
    canGoToNextMessageListPage,
    canGoToPreviousMessageListPage,
    closeMobileSidebar,
    composeDraftValues,
    composeInitialValues,
    composeOpen,
    composeViewMode,
    currentMessageListPage,
    customFoldersOnly,
    customMoveDialogOpen,
    customMoveTargetPath,
    discardComposer,
    dismissServiceWorkerUpdate,
    errorMessage,
    expandedSections,
    flaggedOnly,
    handleAccountUpdated,
    handleClearOfflineCache,
    handleComposeDraftChange,
    handleComposeSent,
    handleComposeViewModeChange,
    handleCustomMoveSubmit,
    handleDismissPushPrompt,
    handleDismissPushStatusMessage,
    handleEnablePushNotifications,
    handleInstallPwa,
    handleLogout,
    handleMessageListItemClick,
    handleMessageListPageChange,
    handleMessageListPageRequest,
    handleOfflineCacheSettingsChange,
    handleRegisterMailtoHandler,
    handleVisibleMessageListPositionChange,
    hideComposer,
    invalidateMailCaches,
    knownContacts,
    lastMessageListPage,
    layoutColumns,
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
    loadAccounts,
    loadProfiles,
    mailPreferences,
    mailSearchSurfaceActive,
    mailSearchValue,
    mailboxesByAccount,
    mailboxesLoading,
    messageContainerClassName,
    messageContainerStyle,
    messageIframeHeight,
    messageIframeRef,
    messageListPageNumbers,
    messageListScopeKey,
    messageLoading,
    messageViewportStyle,
    messageWidthMode,
    messages,
    messagesLoading,
    mobileSidebarOpen,
    moreLoading,
    navigateBackToMailList,
    navigateToMessage,
    offlineCacheSettings,
    offlineCacheStatus,
    offlineStatusActive,
    openedMessage,
    profiles,
    profilesLoading,
    pushLoading,
    pushPromptVisible,
    pushState,
    pushStatusMessage,
    pwaInstallPrompt,
    pwaInstalled,
    readerDownloadAttachment,
    readerHandleForward,
    readerHandleMessageIframeLoad,
    readerHandleReply,
    readerMoveSelectedMessageToCustomFolder,
    readerMoveSelectedMessageToSpecial,
    readerUpdateMessageFlags,
    requestedMessageListPage,
    routeSearch,
    searchHasCriteria,
    searchIndexIncomplete,
    searchScopeLabel,
    selectAccountMailbox,
    selectCustomFolders,
    selectProfileSection,
    selectSection,
    selectedAccountId,
    selectedEmailRenderMode,
    selectedMailboxPath,
    selectedMessageCount,
    selectedMessageHtmlDocument,
    selectedMessageHtmlPreparing,
    selectedMessageId,
    selectedMessageIds,
    selectedMessageOpening,
    selectedProfileId,
    selectedSpecialUse,
    selectedUnreadCount,
    serviceWorkerUpdateAvailable,
    serviceWorkerUpdating,
    setAuthStatus,
    setCustomMoveDialogOpen,
    setCustomMoveTargetPath,
    setMessageWidthMode,
    setRefreshKey,
    setSelectedEmailRenderMode,
    setUser,
    settingsOpen,
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
    startResize,
    syncLoading,
    unreadMessageCount,
    unreadOnly,
    updateCurrentRouteSearch,
    user,
  } = controller
  const localizedComposeInitialValues = React.useMemo(
    () =>
      composeInitialValues
        ? {
            ...composeInitialValues,
            title:
              composeInitialValues.mode === "reply"
                ? t("Ответ", "Reply")
                : composeInitialValues.mode === "forward"
                  ? t("Переслать", "Forward")
                  : t("Новое письмо", "New message"),
          }
        : null,
    [composeInitialValues, t]
  )

  if (authStatus === "checking") {
    return <MailSessionChecking />
  }

  if (authStatus === "anonymous") {
    return (
      <>
        <LoginScreen
          errorMessage={errorMessage}
          onLogin={(nextUser) => {
            setConvexSessionAuthenticated(true)
            setUser(nextUser)
            setAuthStatus("authenticated")
          }}
        />
      </>
    )
  }

  return (
    <TooltipProvider>
      <>
        <MailWorkspace
          hidden={settingsOpen}
          columns={layoutColumns}
          mobileNavigationOpen={mobileSidebarOpen}
          onCloseMobileNavigation={closeMobileSidebar}
        >
          <MailSidebar
            accounts={accounts}
            accountsLoading={accountsLoading}
            customFoldersOnly={customFoldersOnly}
            expandedSections={expandedSections}
            flaggedOnly={flaggedOnly}
            mailboxesByAccount={mailboxesByAccount}
            mailboxesLoading={mailboxesLoading}
            mobileSidebarOpen={mobileSidebarOpen}
            sidebarOrder={mailPreferences.sidebar.order}
            profiles={profiles}
            profilesLoading={profilesLoading}
            selectedAccountId={selectedAccountId}
            selectedMailboxPath={selectedMailboxPath}
            selectedProfileId={selectedProfileId}
            selectedSpecialUse={selectedSpecialUse}
            settingsOpen={settingsOpen}
            closeMobileSidebar={sidebarCloseMobileSidebar}
            invalidateMailCaches={sidebarInvalidateMailCaches}
            loadAccounts={loadAccounts}
            loadProfiles={loadProfiles}
            preloadSettingsPanel={preloadSettingsPanel}
            saveProfileAccountOrder={sidebarSaveProfileAccountOrder}
            saveSidebarOrder={sidebarSaveSidebarOrder}
            selectAccountMailbox={sidebarSelectAccountMailbox}
            selectCustomFolders={sidebarSelectCustomFolders}
            selectFlaggedAccount={sidebarSelectFlaggedAccount}
            selectProfileSection={sidebarSelectProfileSection}
            selectSection={sidebarSelectSection}
            onOpenSettings={() =>
              updateCurrentRouteSearch({
                drawer: null,
                settings: "accounts",
              })
            }
            toggleSection={sidebarToggleSection}
          />

          <ResizeHandle
            label={t("Изменить ширину боковой панели", "Resize sidebar")}
            onPointerDown={(event) => startResize("sidebar", event)}
          />

          <MessageListPane
            accountLabelById={accountLabelById}
            accounts={accounts}
            allMessagesSelected={allMessagesSelected}
            allSelectedFlagged={allSelectedFlagged}
            canGoToNextMessageListPage={canGoToNextMessageListPage}
            canGoToPreviousMessageListPage={canGoToPreviousMessageListPage}
            currentMessageListPage={currentMessageListPage}
            customFoldersOnly={customFoldersOnly}
            errorMessage={errorMessage}
            flaggedOnly={flaggedOnly}
            mailboxesByAccount={mailboxesByAccount}
            listScopeKey={messageListScopeKey}
            lastMessageListPage={lastMessageListPage}
            messageListPageNumbers={messageListPageNumbers}
            messages={messages}
            messagesLoading={messagesLoading}
            moreLoading={moreLoading}
            offlineStatusActive={offlineStatusActive}
            pushLoading={pushLoading}
            pushPromptVisible={pushPromptVisible}
            pushState={pushState}
            pushStatusMessage={pushStatusMessage}
            profiles={profiles}
            requestedMessageListPage={requestedMessageListPage}
            restoredMessageListPosition={
              activeMessageListNavigation.restoredPosition
            }
            searchActive={mailSearchSurfaceActive}
            searchHasCriteria={searchHasCriteria}
            searchIndexIncomplete={searchIndexIncomplete}
            searchScopeLabel={searchScopeLabel}
            searchValue={mailSearchValue}
            serviceWorkerUpdateAvailable={serviceWorkerUpdateAvailable}
            serviceWorkerUpdating={serviceWorkerUpdating}
            selectedAccountId={selectedAccountId}
            selectedMailboxPath={selectedMailboxPath}
            selectedMessageCount={selectedMessageCount}
            selectedMessageId={selectedMessageId}
            selectedMessageIds={selectedMessageIds}
            selectedProfileId={selectedProfileId}
            selectedSpecialUse={selectedSpecialUse}
            selectedUnreadCount={selectedUnreadCount}
            syncLoading={syncLoading}
            unreadMessageCount={unreadMessageCount}
            unreadOnly={unreadOnly}
            preloadComposePanel={preloadComposePanel}
            onMessageClick={handleMessageListItemClick}
            onMessageListPageChange={handleMessageListPageChange}
            onMessageListPageRequest={handleMessageListPageRequest}
            onMoveCheckedMessagesToSpecial={listMoveCheckedMessagesToSpecial}
            onDismissPushPrompt={handleDismissPushPrompt}
            onDismissPushStatusMessage={handleDismissPushStatusMessage}
            onEnablePushNotifications={() =>
              void handleEnablePushNotifications()
            }
            onOpenComposer={listOpenComposer}
            onOpenSearch={listOpenSearch}
            onCloseSearch={listCloseSearch}
            onOpenMessage={listOpenMessage}
            onOpenMobileSidebar={listOpenMobileSidebar}
            onSearchValueChange={listHandleSearchValueChange}
            onApplyServiceWorkerUpdate={() => void applyServiceWorkerUpdate()}
            onDismissServiceWorkerUpdate={dismissServiceWorkerUpdate}
            onSelectAccountMailbox={selectAccountMailbox}
            onSelectCustomFolders={selectCustomFolders}
            onSelectProfileSection={selectProfileSection}
            onSelectSection={selectSection}
            onSyncLocal={listHandleSyncLocal}
            onToggleAllMessagesSelection={listToggleAllMessagesSelection}
            onToggleMessageFlagged={listToggleMessageFlagged}
            onToggleMessageSelection={listToggleMessageSelection}
            onToggleUnreadOnly={listToggleUnreadOnly}
            onMoveMessageToSpecial={listMoveMessageToSpecial}
            onUpdateMessageFlags={listUpdateMessageFlags}
            onUpdateCheckedMessageFlags={listUpdateCheckedMessageFlags}
            onVisibleMessageListPositionChange={
              handleVisibleMessageListPositionChange
            }
          />

          <ResizeHandle
            label={t("Изменить ширину списка писем", "Resize message list")}
            onPointerDown={(event) => startResize("messageList", event)}
          />

          <MessageReaderPane
            downloadAttachment={readerDownloadAttachment}
            handleForward={readerHandleForward}
            handleMessageIframeLoad={readerHandleMessageIframeLoad}
            handleReply={readerHandleReply}
            messageIframeRef={messageIframeRef}
            messageContainerClassName={messageContainerClassName}
            messageContainerStyle={messageContainerStyle}
            messageHtmlPreparing={selectedMessageHtmlPreparing}
            messageIframeHeight={messageIframeHeight}
            messageLoading={messageLoading || selectedMessageOpening}
            messageThread={activeMessageThread}
            messageViewportStyle={messageViewportStyle}
            messageWidthMode={messageWidthMode}
            moveSelectedMessageToCustomFolder={
              readerMoveSelectedMessageToCustomFolder
            }
            moveSelectedMessageToSpecial={readerMoveSelectedMessageToSpecial}
            openedMessage={openedMessage}
            emailRenderMode={selectedEmailRenderMode}
            onBackToList={navigateBackToMailList}
            onEmailRenderModeChange={setSelectedEmailRenderMode}
            onOpenThreadMessage={navigateToMessage}
            selectedMessage={activeSelectedMessage}
            selectedMessageHtmlDocument={selectedMessageHtmlDocument}
            selectedMessageId={selectedMessageId}
            setMessageWidthMode={setMessageWidthMode}
            updateMessageFlags={readerUpdateMessageFlags}
          />
        </MailWorkspace>

        {settingsOpen ? (
          <React.Suspense
            fallback={
              <LazyPanelFallback
                label={t("Открываю настройки", "Opening settings")}
                page
              />
            }
          >
            <SettingsPanel
              accounts={accounts}
              applicationOrigin={window.location.origin}
              canManageUsers={user?.role === "owner"}
              activeTab={routeSearch.settings ?? "accounts"}
              mailPreferences={mailPreferences}
              offlineCacheSettings={offlineCacheSettings}
              offlineCacheStatus={offlineCacheStatus}
              pwaInstallAvailable={pwaInstallPrompt !== null}
              pwaInstalled={pwaInstalled}
              mailtoRegistrationAvailable={canRegisterMailtoHandler(
                navigator,
                window.isSecureContext
              )}
              profiles={profiles}
              profilesLoading={profilesLoading}
              onClose={() => updateCurrentRouteSearch({ settings: null })}
              onTabChange={(tab, replace = false) =>
                updateCurrentRouteSearch({ settings: tab }, replace)
              }
              onClearOfflineCache={handleClearOfflineCache}
              onAccountUpdated={handleAccountUpdated}
              onLogout={() => void handleLogout()}
              onMailPreferencesChange={applyMailPreferences}
              onInstallPwa={handleInstallPwa}
              onRegisterMailtoHandler={handleRegisterMailtoHandler}
              onOfflineCacheSettingsChange={handleOfflineCacheSettingsChange}
              onAccountCreated={async () => {
                invalidateMailCaches()
                await loadAccounts({ force: true })
                await loadProfiles({ force: true })
                setRefreshKey((currentKey) => currentKey + 1)
              }}
              onProfilesChanged={async () => {
                invalidateMailCaches()
                await loadProfiles({ force: true })
                setRefreshKey((currentKey) => currentKey + 1)
              }}
            />
          </React.Suspense>
        ) : null}

        {composeOpen && !settingsOpen ? (
          <React.Suspense
            fallback={
              <LazyPanelFallback
                label={t("Открываю редактор", "Opening editor")}
              />
            }
          >
            <ComposePanel
              accounts={accounts}
              contacts={knownContacts}
              defaultAccountId={selectedAccountId ?? accounts[0]?.id ?? ""}
              draft={composeDraftValues}
              initialValues={localizedComposeInitialValues}
              mailPreferences={mailPreferences}
              viewMode={composeViewMode}
              onDiscard={discardComposer}
              onDraftChange={handleComposeDraftChange}
              onMailPreferencesChange={applyMailPreferences}
              onMinimize={hideComposer}
              onSaveDraftAndClose={hideComposer}
              onSent={handleComposeSent}
              onViewModeChange={handleComposeViewModeChange}
            />
          </React.Suspense>
        ) : null}

        <Dialog
          open={customMoveDialogOpen && !settingsOpen}
          onOpenChange={setCustomMoveDialogOpen}
        >
          <DialogContent
            closeLabel={t("Закрыть", "Close")}
            className="sm:max-w-[440px]"
          >
            <form
              className="grid gap-4"
              onSubmit={(event) => void handleCustomMoveSubmit(event)}
            >
              <DialogHeader>
                <DialogTitle>
                  {t("Переместить в папку", "Move to folder")}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    "Укажи путь папки в выбранном почтовом ящике.",
                    "Enter the folder path in the selected mailbox."
                  )}
                </DialogDescription>
              </DialogHeader>
              <label className="grid gap-1.5 text-xs font-semibold text-[#4c5661] dark:text-[#c4ccd4]">
                {t("Путь папки", "Folder path")}
                <Input
                  autoFocus
                  className="h-10 border border-[#cfd6dd] bg-white px-3 text-sm dark:border-[#30353a] dark:bg-[#181b1f]"
                  value={customMoveTargetPath}
                  onChange={(event) =>
                    setCustomMoveTargetPath(event.target.value)
                  }
                />
              </label>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCustomMoveDialogOpen(false)}
                >
                  {t("Отмена", "Cancel")}
                </Button>
                <Button disabled={!customMoveTargetPath.trim()} type="submit">
                  {t("Переместить", "Move")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </>
    </TooltipProvider>
  )
}

function LoginScreen({
  errorMessage,
  onLogin,
}: {
  errorMessage: string | null
  onLogin: (user: UserDto) => void
}) {
  return (
    <LoginForm
      localizeError={localizeRequestErrorText}
      defaultEmail={defaultLoginEmail}
      errorMessage={errorMessage}
      onSubmit={async ({ email, password }) => {
        const data = await apiFetch<{ user: UserDto }>("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        })
        onLogin(data.user)
      }}
    />
  )
}

function ResizeHandle({
  label,
  onPointerDown,
}: {
  label: string
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      aria-label={label}
      className="group hidden cursor-col-resize items-center justify-center bg-[#e4e9ee] transition hover:bg-[#cbd5df] lg:flex dark:bg-[#252a30] dark:hover:bg-[#3a424b]"
      role="separator"
      tabIndex={0}
      onPointerDown={onPointerDown}
    >
      <IconGripVertical className="size-4 text-[#7a838c] opacity-0 transition group-hover:opacity-100 dark:text-[#a7b0ba]" />
    </div>
  )
}
