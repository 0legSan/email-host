import { mailApiFetch } from "@/lib/api-transport"
import { mailText } from "@workspace/mail-design/locale"
import { requestErrorText } from "./request-error-text"

export type ApiResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: {
        code: string
        message: string
      }
    }

export type UserDto = {
  id: string
  email: string
  role: "owner" | "user"
  displayName: string | null
}

export type ManagedUserDto = UserDto & {
  createdAt: string
  deactivatedAt: string | null
}

export type RegistrationInvitePublicDto = {
  expiresAt: string
}

export type RegistrationInviteCreatedDto = RegistrationInvitePublicDto & {
  token: string
}

export type CreateRegistrationInviteResponse = {
  invite: RegistrationInviteCreatedDto
}

export type GetRegistrationInviteResponse = {
  invite: RegistrationInvitePublicDto
}

export type PasswordResetLinkPublicDto = {
  expiresAt: string
}

export type PasswordResetLinkCreatedDto = PasswordResetLinkPublicDto & {
  token: string
}

export type ListManagedUsersResponse = {
  users: ManagedUserDto[]
}

export type DeactivateManagedUserResponse = {
  user: ManagedUserDto
}

export type CreatePasswordResetLinkResponse = {
  link: PasswordResetLinkCreatedDto
  user: ManagedUserDto
}

export type GetPasswordResetLinkResponse = {
  link: PasswordResetLinkPublicDto
}

export type ResetPasswordResponse = {
  user: UserDto
}

export type MailAccountDto = {
  id: string
  provider: "gmail" | "yandex" | "mailru" | "rambler" | "beget" | "custom"
  address: string
  label: string | null
  displayName: string | null
  connectionStatus:
    | "pending"
    | "active"
    | "auth_error"
    | "connect_error"
    | "disconnecting"
    | "disconnected"
  syncStatus: "idle" | "initial_sync" | "incremental_sync" | "failed" | "paused"
  lastSyncAt: string | null
  lastError: string | null
}

export type MailProfileDto = {
  id: string
  name: string
  accountIds: string[]
}

export type MailSidebarOrderItem = {
  type: "account" | "profile"
  id: string
}

export type MailSignatureDto = {
  accountId?: string | null
  id: string
  name: string
  html: string
  updatedAt: string | null
}

export type MailSignatureComposeMode = "new" | "reply" | "forward"

export type MailSignatureDefaults = Record<
  MailSignatureComposeMode,
  string | null
>

export type MailSignatureAccountDefaults = Partial<MailSignatureDefaults>

export type MailPreferencesDto = {
  sidebar: {
    order: MailSidebarOrderItem[]
  }
  signatures: {
    defaultId: string | null
    defaults: {
      global: MailSignatureDefaults
      accounts: Record<string, MailSignatureAccountDefaults>
    }
    items: MailSignatureDto[]
  }
}

export type UpsertMailSignatureRequest = {
  accountId?: string | null
  id?: string
  name: string
  html: string
  defaultFor?: {
    accountId?: string | null
    modes: MailSignatureComposeMode[]
  }
  makeDefault?: boolean
}

export type UpdateMailSignatureDefaultsRequest = {
  accountId?: string | null
  defaults: MailSignatureAccountDefaults
}

export type MailAddress = {
  address: string
  name?: string | null
}

export type MailContactDto = {
  address: string
  name: string | null
  lastInteractionAt: string
}

export type MailboxDto = {
  path: string
  name: string
  specialUse: string | null
  messagesTotal: number | null
  messagesUnread: number | null
  searchComplete: boolean
}

export type MessageListItemDto = {
  id: string
  accountId: string | null
  path: string | null
  subject: string | null
  from: MailAddress | null
  to: MailAddress[]
  sentAt: string | null
  snippet: string | null
  seen: boolean
  flagged: boolean
  hasAttachments: boolean
  sizeBytes: number | null
  openTracking?: {
    enabled: boolean
    openCount: number
    firstOpenedAt: string | null
    lastOpenedAt: string | null
  } | null
  clickTracking?: {
    enabled: boolean
    clickCount: number
    firstClickedAt: string | null
    lastClickedAt: string | null
  } | null
}

export type AttachmentDto = {
  id: string
  filename: string | null
  contentType: string | null
  sizeBytes: number | null
  contentId: string | null
  isInline: boolean
}

export type MessageDto = MessageListItemDto & {
  bodyStatus: "not_loaded" | "loaded" | "failed"
  text: string | null
  html: string | null
  attachments: AttachmentDto[]
}

export type MessageThreadItemDto = MessageListItemDto & {
  mailboxName: string | null
  mailboxSpecialUse: string | null
  isDraft: boolean
}

export type MessageThreadDto = {
  id: string
  accountId: string
  subject: string | null
  messageCount: number
  messages: MessageThreadItemDto[]
}

export type RequestError = Error & {
  code?: string
  status?: number
}

type ApiFetchInit = RequestInit & {
  timeoutMs?: number
}

export type ImapProvider =
  "gmail" | "yandex" | "mailru" | "rambler" | "beget" | "custom"

export type MailConnectionSettings = {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
}

export type ConnectImapAccountRequest = {
  provider: ImapProvider
  address: string
  displayName?: string
  imap: MailConnectionSettings
  smtp: MailConnectionSettings
}

export type MessagePageRequest = {
  accountId: string | null
  accountIds: string[] | null
  searchMode: boolean
  path: string | null
  specialUse: string | null
  customFolders: boolean
  q: string
  from: string
  to: string
  subject: string
  after: string
  before: string
  hasAttachments: boolean
  unread: boolean
  flagged: boolean
  cursor?: string
}

export type MessagePageDto = {
  offline?: boolean
  total: number | null
  nextPageCursor: string | null
  messages: MessageListItemDto[]
}

export type BootstrapDto = {
  user: UserDto
  accounts: MailAccountDto[]
  preferences: MailPreferencesDto
  profiles: MailProfileDto[]
  mailboxesByAccount: Record<string, MailboxDto[]>
  initialMessages: {
    scope: MessagePageRequest
    page: MessagePageDto
  }
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}) {
  const { signal, timeoutMs, ...requestInit } = init
  const timeoutEnabled = typeof timeoutMs === "number" && timeoutMs > 0
  const controller = timeoutEnabled || signal ? new AbortController() : null
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let timedOut = false
  const abortRequest = () => controller?.abort()

  if (controller) {
    if (signal?.aborted) {
      controller.abort()
    } else {
      signal?.addEventListener("abort", abortRequest, { once: true })
    }

    if (timeoutEnabled) {
      timeoutId = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
    }
  }

  try {
    const response = await mailApiFetch(path, {
      credentials: "include",
      ...requestInit,
      signal: controller?.signal ?? signal,
    })
    const responseText = await response.text()
    const body = parseApiResponse<T>(responseText, response)

    if (!response.ok || !body?.ok) {
      const error = new Error(
        body?.ok === false
          ? requestErrorText(body.error.code, body.error.message)
          : mailText(
              `Запрос завершился с\u00a0ошибкой ${response.status}`,
              `Request failed with status ${response.status}`
            ),
        { cause: body?.ok === false ? body.error.message : undefined }
      ) as RequestError

      error.code = body?.ok === false ? body.error.code : undefined
      error.status = response.status
      throw error
    }

    return body.data
  } catch (error) {
    if (timedOut) {
      throw new Error(
        mailText(
          "Время ожидания запроса истекло. Повторите действие.",
          "The request timed out. Try again."
        ),
        {
          cause: error,
        }
      )
    }

    throw error
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }

    signal?.removeEventListener("abort", abortRequest)
  }
}

function parseApiResponse<T>(
  responseText: string,
  response: Response
): ApiResponse<T> | null {
  if (!responseText) {
    return null
  }

  try {
    return JSON.parse(responseText) as ApiResponse<T>
  } catch {
    const error = new Error(
      mailText(
        `Сервер вернул неожиданный ответ. Код ${response.status}.`,
        `The server returned an unexpected response. Status ${response.status}.`
      )
    ) as RequestError

    error.status = response.status
    throw error
  }
}

export function upsertMailSignature(request: UpsertMailSignatureRequest) {
  return apiFetch<{ preferences: MailPreferencesDto }>(
    "/api/mail/preferences/signature",
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    }
  )
}

export function updateMailSignatureDefaults(
  request: UpdateMailSignatureDefaultsRequest
) {
  return apiFetch<{ preferences: MailPreferencesDto }>(
    "/api/mail/preferences/signature-defaults",
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    }
  )
}

export async function fetchMessagesPage(
  params: MessagePageRequest,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
) {
  const searchParams = new URLSearchParams()
  searchParams.set("pageSize", String(50))
  const accountId =
    params.accountIds?.length === 1 ? params.accountIds[0] : params.accountId

  if (params.accountIds && params.accountIds.length > 1) {
    searchParams.set("accountIds", params.accountIds.join(","))
  } else if (accountId) {
    searchParams.set("accountId", accountId)
  }

  if (params.searchMode) {
    searchParams.set("searchMode", "true")
  }

  if (params.path) {
    searchParams.set("path", params.path)
  }

  if (params.specialUse) {
    searchParams.set("specialUse", params.specialUse)
  }

  if (params.customFolders) {
    searchParams.set("customFolders", "true")
  }

  if (params.q) {
    searchParams.set("q", params.q)
  }

  if (params.from) {
    searchParams.set("from", params.from)
  }

  if (params.to) {
    searchParams.set("to", params.to)
  }

  if (params.subject) {
    searchParams.set("subject", params.subject)
  }

  if (params.after) {
    searchParams.set("after", params.after)
  }

  if (params.before) {
    searchParams.set("before", params.before)
  }

  if (params.hasAttachments) {
    searchParams.set("hasAttachments", "true")
  }

  if (params.unread) {
    searchParams.set("unread", "true")
  }

  if (params.flagged) {
    searchParams.set("flagged", "true")
  }

  if (params.cursor) {
    searchParams.set("cursor", params.cursor)
  }

  return apiFetch<MessagePageDto>(
    `/api/mail/messages?${searchParams.toString()}`,
    {
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    }
  )
}

export function fetchBootstrap(options: { timeoutMs?: number } = {}) {
  return apiFetch<BootstrapDto>("/api/mail/bootstrap", options)
}

export function fetchMessagesBatch(
  messageIds: string[],
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
) {
  return apiFetch<{ messages: MessageDto[] }>("/api/mail/messages/batch", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ messageIds }),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  })
}

export function fetchMessageThread(
  messageId: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
) {
  return apiFetch<{ thread: MessageThreadDto }>(
    `/api/mail/messages/${messageId}/thread`,
    {
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    }
  )
}
