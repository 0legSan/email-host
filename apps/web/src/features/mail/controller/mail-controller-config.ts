import { mailStorageKey } from "@/lib/mail-storage-namespace"
import type { InfiniteData } from "@tanstack/react-query"
import type {
  ComposeDraftValues,
  ComposeInitialValues,
} from "@/components/compose-panel"
import type {
  MailPreferencesDto,
  MessageListItemDto,
  MessagePageDto,
  MessagePageRequest,
} from "@/lib/api-client"
import type { MessageListPosition } from "@/lib/offline-mail-cache"
import type { EmailRenderMode } from "@/lib/email-render"

export type EmailRenderModeOverrides = Record<string, EmailRenderMode>
export type EmailRenderCacheEntry = {
  backgroundColor: string | null
  document: string
}
export type StoredComposeDraft = {
  draftValues: ComposeDraftValues
  initialValues: ComposeInitialValues | null
}
export type QueryFetchOptions = {
  force?: boolean
  retry?: false | number
  staleTimeMs?: number
}
export type MessageListInfiniteData = InfiniteData<
  MessagePageDto,
  string | null
>
export type MessageListCacheData = MessageListInfiniteData | MessagePageDto
export type ConvexMessageListPage = {
  page: MessageListItemDto[]
  continueCursor: string
  isDone: boolean
}
export type MessageListWindowPage = {
  pageNumber: number
  cursor: string | null
  data: MessagePageDto | null
  loading: boolean
  source: object | null
}
export type MessageListNavigationState = {
  scopeKey: string
  currentPage: number
  cursors: Record<string, string | null>
  restoredPosition: MessageListPosition | null
  restored: boolean
}
export type RealtimeMessageState = Pick<
  MessageListItemDto,
  "id" | "seen" | "flagged"
> & {
  updatedAt: number
}

export type PwaInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: "accepted" | "dismissed"
    platform: string
  }>
}

export const pageSize = 50
export const emailRenderCacheLimit = 4
export const emailRenderModeOverridesStorageKey = mailStorageKey(
  "email-render-mode-overrides:v1"
)
export const composeDraftStorageKey = mailStorageKey("compose-draft:v1")
export const composeViewModeStorageKey = mailStorageKey("compose-view-mode:v1")
export const knownContactsStorageKeyPrefix =
  mailStorageKey("known-contacts:v1:")
export const pushPromptDismissedStorageKey = mailStorageKey(
  "push-prompt-dismissed:v1"
)
export const mailPanelWidthsStorageKey = mailStorageKey("mail-panel-widths:v1")
export const defaultSidebarWidth = 250
export const minimumSidebarWidth = 220
export const maximumSidebarWidth = 380
export const defaultMessageListWidth = 450
export const minimumMessageListWidth = 320
export const maximumMessageListWidth = 640
export const recentMessageDetailWarmBatchSize = 10
export const recentMessageDetailWarmQueueLimit = pageSize * 2
export const messageFlagsBatchSize = 100
export const startupBootstrapTimeoutMs = 4500
export const readApiRequestTimeoutMs = 8000
export const realtimeMessageListFallbackDelayMs = 5000
export const mailSyncRequestTimeoutMs = 20_000
export const messageListStaleTimeMs = 2 * 60 * 1000
export const messageListGcTimeMs = 0
export const defaultMailPreferences: MailPreferencesDto = {
  sidebar: {
    order: [],
  },
  signatures: {
    defaultId: null,
    defaults: {
      global: {
        new: null,
        reply: null,
        forward: null,
      },
      accounts: {},
    },
    items: [],
  },
}
export const initialMessagePageRequest: MessagePageRequest = {
  accountId: null,
  accountIds: null,
  searchMode: false,
  path: null,
  specialUse: "\\Inbox",
  customFolders: false,
  q: "",
  from: "",
  to: "",
  subject: "",
  after: "",
  before: "",
  hasAttachments: false,
  unread: false,
  flagged: false,
}
