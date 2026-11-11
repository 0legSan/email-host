import type { MouseEvent } from "react"
import type { PushSubscriptionState } from "@workspace/pwa/client"

import type { MailSection } from "@/features/mail/model/mail-sections"
import type {
  MailAccountDto,
  MailboxDto,
  MailProfileDto,
  MessageListItemDto,
} from "@/lib/api-client"
import type { MailSearchValue } from "@/lib/mail-search"
import type { MessageListPosition } from "@/lib/offline-mail-cache"

export type VisibleMessageListPosition = {
  page: number
  anchorMessageId: string | null
  anchorOffset: number
}

export type MessageListPaneProps = {
  accountLabelById: Map<string, string>
  accounts: MailAccountDto[]
  allMessagesSelected: boolean
  allSelectedFlagged: boolean
  canGoToNextMessageListPage: boolean
  canGoToPreviousMessageListPage: boolean
  currentMessageListPage: number
  customFoldersOnly: boolean
  errorMessage: string | null
  flaggedOnly: boolean
  mailboxesByAccount: Record<string, MailboxDto[]>
  listScopeKey: string
  lastMessageListPage: number | null
  messageListPageNumbers: number[]
  messages: MessageListItemDto[]
  messagesLoading: boolean
  moreLoading: boolean
  offlineStatusActive: boolean
  pushLoading: boolean
  pushPromptVisible: boolean
  pushState: PushSubscriptionState
  pushStatusMessage: string | null
  profiles: MailProfileDto[]
  requestedMessageListPage: number | null
  restoredMessageListPosition: MessageListPosition | null
  searchActive: boolean
  searchHasCriteria: boolean
  searchIndexIncomplete: boolean
  searchScopeLabel: string
  searchValue: MailSearchValue
  serviceWorkerUpdateAvailable: boolean
  serviceWorkerUpdating: boolean
  selectedAccountId: string | null
  selectedMailboxPath: string | null
  selectedMessageCount: number
  selectedMessageId: string | null
  selectedMessageIds: Set<string>
  selectedProfileId: string | null
  selectedSpecialUse: string | null
  selectedUnreadCount: number
  syncLoading: boolean
  unreadMessageCount: number
  unreadOnly: boolean
  preloadComposePanel: () => void
  onMessageClick: (
    message: MessageListItemDto,
    event: MouseEvent<HTMLButtonElement>
  ) => void
  onMessageListPageChange: (page: number) => void
  onMessageListPageRequest: (page: number | null) => void
  onMoveCheckedMessagesToSpecial: (specialUse: string) => void | Promise<void>
  onDismissPushPrompt: () => void
  onDismissPushStatusMessage: () => void
  onEnablePushNotifications: () => void | Promise<void>
  onOpenComposer: () => void
  onOpenSearch: () => void
  onCloseSearch: () => void
  onOpenMessage: (message: MessageListItemDto) => void
  onOpenMobileSidebar: () => void
  onSearchValueChange: (value: MailSearchValue) => void
  onApplyServiceWorkerUpdate: () => void
  onDismissServiceWorkerUpdate: () => void
  onSelectAccountMailbox: (accountId: string, mailboxPath: string) => void
  onSelectCustomFolders: () => void
  onSelectProfileSection: (profileId: string, section: MailSection) => void
  onSelectSection: (section: MailSection) => void
  onSyncLocal: () => void | Promise<void>
  onToggleAllMessagesSelection: () => void
  onToggleMessageFlagged: (message: MessageListItemDto) => void | Promise<void>
  onToggleMessageSelection: (message: MessageListItemDto) => void
  onToggleUnreadOnly: () => void
  onMoveMessageToSpecial: (
    message: MessageListItemDto,
    specialUse: string
  ) => void | Promise<void>
  onUpdateMessageFlags: (
    messageId: string,
    flags: { seen?: boolean; flagged?: boolean }
  ) => void | Promise<void>
  onUpdateCheckedMessageFlags: (flags: {
    seen?: boolean
    flagged?: boolean
  }) => void | Promise<void>
  onVisibleMessageListPositionChange: (
    position: VisibleMessageListPosition
  ) => void
}
