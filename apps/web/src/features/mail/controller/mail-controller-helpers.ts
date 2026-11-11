import { mailText } from "@workspace/mail-design/locale"
import { type QueryClient, type QueryKey } from "@tanstack/react-query"
import {
  defaultMailPreferences,
  emailRenderCacheLimit,
  initialMessagePageRequest,
  mailSyncRequestTimeoutMs,
  pageSize,
  type EmailRenderCacheEntry,
  type MessageListCacheData,
  type MessageListInfiniteData,
  type MessageListNavigationState,
  type QueryFetchOptions,
} from "@/features/mail/controller/mail-controller-config"
import { getBaseDomain } from "@/features/mail/controller/mail-controller-storage"
import {
  apiFetch,
  type AttachmentDto,
  type BootstrapDto,
  type MailAddress,
  type MailboxDto,
  type MailPreferencesDto,
  type MessageDto,
  type MessagePageDto,
  type MessageListItemDto,
  type MessageThreadDto,
  type RequestError,
} from "@/lib/api-client"
import { queryKeys } from "@/lib/query-keys"

export function parseMailDateBoundary(value: string, inclusiveEnd = false) {
  if (!value) return undefined

  const boundary = new Date(`${value}T00:00:00`).getTime()
  return inclusiveEnd ? boundary + 24 * 60 * 60 * 1000 : boundary
}

export function fetchCachedQuery<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  queryFn: (context: { signal: AbortSignal }) => Promise<T>,
  options: QueryFetchOptions = {}
) {
  return queryClient.fetchQuery({
    queryKey,
    queryFn,
    retry: options.retry,
    staleTime: options.force ? 0 : options.staleTimeMs,
  })
}

export function createEmptyMessagePage(): MessagePageDto {
  return {
    messages: [],
    nextPageCursor: null,
    total: 0,
  }
}

export function createMessageListNavigationState(
  scopeKey: string
): MessageListNavigationState {
  return {
    scopeKey,
    currentPage: 1,
    cursors: { "1": null },
    restoredPosition: null,
    restored: false,
  }
}

export function getMessageListWindowPageNumbers(currentPage: number) {
  return [...new Set([1, currentPage - 1, currentPage, currentPage + 1])]
    .filter((pageNumber) => pageNumber > 0)
    .sort((a, b) => a - b)
}

export function preserveNewerInitialMessagePage(
  queryClient: QueryClient,
  data: BootstrapDto,
  previousData: MessageListInfiniteData | undefined
) {
  const queryState = queryClient.getQueryState<MessageListInfiniteData>(
    queryKeys.messageList(initialMessagePageRequest)
  )
  const currentPage = queryState?.data?.pages[0]

  if (!currentPage || queryState.data === previousData) {
    return data
  }

  return {
    ...data,
    initialMessages: {
      ...data.initialMessages,
      page: currentPage,
    },
  }
}

export function invalidateCachedQueries(
  queryClient: QueryClient,
  predicate: (queryKey: QueryKey) => boolean
) {
  void queryClient.invalidateQueries({
    predicate: (query) => predicate(query.queryKey),
  })
}

export function patchMessageListItemData(
  data: MessageListCacheData | undefined,
  messageId: string,
  patch: Partial<MessageListItemDto>
) {
  if (!data) {
    return data
  }

  if (!("pages" in data)) {
    return {
      ...data,
      messages: data.messages.map((message) =>
        message.id === messageId ? { ...message, ...patch } : message
      ),
    }
  }

  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      messages: page.messages.map((message) =>
        message.id === messageId ? { ...message, ...patch } : message
      ),
    })),
  }
}

export function patchMessageListStatesData(
  data: MessageListCacheData | undefined,
  states: Array<Pick<MessageListItemDto, "id" | "seen" | "flagged">>
) {
  if (!data || states.length === 0) {
    return data
  }

  const statesById = new Map(states.map((state) => [state.id, state]))

  if (!("pages" in data)) {
    let changed = false
    const messages = data.messages.map((message) => {
      const nextMessage = patchMessageWithRealtimeState(message, statesById)

      if (nextMessage !== message) {
        changed = true
      }

      return nextMessage
    })

    return changed ? { ...data, messages } : data
  }

  let changed = false
  const pages = data.pages.map((page) => {
    let pageChanged = false
    const messages = page.messages.map((message) => {
      const nextMessage = patchMessageWithRealtimeState(message, statesById)

      if (nextMessage !== message) {
        changed = true
        pageChanged = true
      }

      return nextMessage
    })

    return pageChanged ? { ...page, messages } : page
  })

  return changed ? { ...data, pages } : data
}

export function patchMessageWithRealtimeState<T extends MessageListItemDto>(
  message: T,
  statesById: Map<string, Pick<MessageListItemDto, "id" | "seen" | "flagged">>
) {
  const state = statesById.get(message.id)

  return state &&
    (state.seen !== message.seen || state.flagged !== message.flagged)
    ? {
        ...message,
        seen: state.seen,
        flagged: state.flagged,
      }
    : message
}

export function patchMessageThreadWithRealtimeStates(
  thread: MessageThreadDto,
  statesById: Map<string, Pick<MessageListItemDto, "id" | "seen" | "flagged">>
) {
  let changed = false
  const messages = thread.messages.map((message) => {
    const nextMessage = patchMessageWithRealtimeState(message, statesById)

    if (nextMessage !== message) {
      changed = true
    }

    return nextMessage
  })

  return changed ? { ...thread, messages } : thread
}

export function mergeRealtimeMessage(
  cachedMessage: MessageDto | null | undefined,
  realtimeMessage: MessageDto
) {
  if (
    !cachedMessage ||
    cachedMessage.id !== realtimeMessage.id ||
    cachedMessage.bodyStatus !== "loaded" ||
    realtimeMessage.bodyStatus === "loaded"
  ) {
    return realtimeMessage
  }

  return {
    ...realtimeMessage,
    bodyStatus: cachedMessage.bodyStatus,
    text: cachedMessage.text,
    html: cachedMessage.html,
    attachments: cachedMessage.attachments,
  }
}

export function removeMessageListItemsData(
  data: MessageListCacheData | undefined,
  messageIds: Set<string>
) {
  if (!data) {
    return data
  }

  if (!("pages" in data)) {
    const messages = data.messages.filter(
      (message) => !messageIds.has(message.id)
    )
    const removedCount = data.messages.length - messages.length

    return {
      ...data,
      total:
        data.total === null ? null : Math.max(0, data.total - removedCount),
      messages,
    }
  }

  return {
    ...data,
    pages: data.pages.map((page) => {
      const messages = page.messages.filter(
        (message) => !messageIds.has(message.id)
      )
      const removedCount = page.messages.length - messages.length

      return {
        ...page,
        total:
          page.total === null ? null : Math.max(0, page.total - removedCount),
        messages,
      }
    }),
  }
}

export function restoreMessageListSnapshot(
  queryClient: QueryClient,
  snapshot: Array<[QueryKey, MessageListCacheData | undefined]>
) {
  for (const [queryKey, data] of snapshot) {
    queryClient.setQueryData(queryKey, data)
  }
}

export function findMessageListItemInData(
  data: MessageListCacheData | undefined,
  messageId: string
) {
  if (!data) {
    return null
  }

  if (!("pages" in data)) {
    return data.messages.find((item) => item.id === messageId) ?? null
  }

  for (const page of data.pages) {
    const message = page.messages.find((item) => item.id === messageId)

    if (message) {
      return message
    }
  }

  return null
}

export function findMessageListItemInSnapshot(
  snapshot: Array<[QueryKey, MessageListCacheData | undefined]>,
  messageId: string
) {
  for (const [, data] of snapshot) {
    const message = findMessageListItemInData(data, messageId)

    if (message) {
      return message
    }
  }

  return null
}

export function getUnreadCountDelta(previousSeen: boolean, nextSeen: boolean) {
  if (previousSeen === nextSeen) {
    return 0
  }

  return nextSeen ? -1 : 1
}

export function patchMailboxListUnreadCount(
  mailboxes: MailboxDto[],
  path: string,
  delta: number
) {
  if (delta === 0) {
    return mailboxes
  }

  let changed = false
  const nextMailboxes = mailboxes.map((mailbox) => {
    if (mailbox.path !== path) {
      return mailbox
    }

    changed = true
    return {
      ...mailbox,
      messagesUnread: Math.max(0, (mailbox.messagesUnread ?? 0) + delta),
    }
  })

  return changed ? nextMailboxes : mailboxes
}

export function patchMailboxesByAccountUnreadCount(
  mailboxesByAccount: Record<string, MailboxDto[]>,
  accountId: string,
  path: string,
  delta: number
) {
  const mailboxes = mailboxesByAccount[accountId]

  if (!mailboxes) {
    return mailboxesByAccount
  }

  const nextMailboxes = patchMailboxListUnreadCount(mailboxes, path, delta)

  if (nextMailboxes === mailboxes) {
    return mailboxesByAccount
  }

  return {
    ...mailboxesByAccount,
    [accountId]: nextMailboxes,
  }
}

export function isEditorUiEscapeTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        ".editor-ui-editor, .editor-ui-combobox, .editor-ui-editor__menu, .editor-ui-block-menu"
      )
    )
  )
}

export function hasOpenEditorUiOverlay() {
  return Boolean(
    document.querySelector(
      ".editor-ui-combobox, .editor-ui-editor__menu, .editor-ui-block-menu, [data-editor-ui-overlay='true']"
    )
  )
}

export function normalizeMailPreferences(
  preferences: MailPreferencesDto | null | undefined
): MailPreferencesDto {
  if (!preferences) {
    return defaultMailPreferences
  }

  const signatureItems = Array.isArray(preferences.signatures?.items)
    ? preferences.signatures.items
    : []
  const signatureIds = new Set(signatureItems.map((signature) => signature.id))
  const defaultSignatureId =
    preferences.signatures?.defaultId &&
    signatureIds.has(preferences.signatures.defaultId)
      ? preferences.signatures.defaultId
      : (signatureItems[0]?.id ?? null)
  const globalDefaults = normalizeMailSignatureDefaults(
    preferences.signatures?.defaults?.global,
    signatureIds,
    defaultSignatureId
  )
  const accountDefaults = normalizeMailSignatureAccountDefaults(
    preferences.signatures?.defaults?.accounts,
    signatureIds
  )

  return {
    sidebar: {
      order: preferences.sidebar?.order ?? [],
    },
    signatures: {
      defaultId: globalDefaults.new ?? defaultSignatureId,
      defaults: {
        global: globalDefaults,
        accounts: accountDefaults,
      },
      items: signatureItems,
    },
  }
}

export function normalizeMailSignatureDefaults(
  defaults: MailPreferencesDto["signatures"]["defaults"]["global"] | undefined,
  signatureIds: Set<string>,
  fallbackId: string | null
): MailPreferencesDto["signatures"]["defaults"]["global"] {
  return {
    new: normalizeMailSignatureDefaultValue(
      defaults,
      "new",
      signatureIds,
      fallbackId
    ),
    reply: normalizeMailSignatureDefaultValue(
      defaults,
      "reply",
      signatureIds,
      fallbackId
    ),
    forward: normalizeMailSignatureDefaultValue(
      defaults,
      "forward",
      signatureIds,
      fallbackId
    ),
  }
}

export function normalizeMailSignatureAccountDefaults(
  accounts:
    MailPreferencesDto["signatures"]["defaults"]["accounts"] | undefined,
  signatureIds: Set<string>
): MailPreferencesDto["signatures"]["defaults"]["accounts"] {
  const normalizedAccounts: MailPreferencesDto["signatures"]["defaults"]["accounts"] =
    {}

  if (!accounts) {
    return normalizedAccounts
  }

  for (const [accountId, defaults] of Object.entries(accounts)) {
    const normalizedDefaults: MailPreferencesDto["signatures"]["defaults"]["accounts"][string] =
      {}

    for (const mode of ["new", "reply", "forward"] as const) {
      if (Object.hasOwn(defaults, mode)) {
        normalizedDefaults[mode] = normalizeMailSignatureId(
          defaults[mode],
          signatureIds
        )
      }
    }

    if (Object.keys(normalizedDefaults).length > 0) {
      normalizedAccounts[accountId] = normalizedDefaults
    }
  }

  return normalizedAccounts
}

export function normalizeMailSignatureDefaultValue(
  defaults: MailPreferencesDto["signatures"]["defaults"]["global"] | undefined,
  mode: "new" | "reply" | "forward",
  signatureIds: Set<string>,
  fallbackId: string | null
) {
  if (!defaults || !Object.hasOwn(defaults, mode)) {
    return fallbackId
  }

  return normalizeMailSignatureId(defaults[mode], signatureIds)
}

export function normalizeMailSignatureId(
  value: unknown,
  signatureIds: Set<string>
) {
  return typeof value === "string" && signatureIds.has(value) ? value : null
}

export async function moveMessage(messageId: string, targetPath: string) {
  return apiFetch<{ message: MessageDto }>(
    `/api/mail/messages/${messageId}/move`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path: targetPath,
      }),
    }
  )
}

export async function syncMailScope(
  accountId: string,
  path: string | undefined
) {
  return apiFetch<{ queued: true }>(
    `/api/mail/accounts/${accountId}/sync-local`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        path,
        pageSize,
        pageLimit: 1,
      }),
      timeoutMs: mailSyncRequestTimeoutMs,
    }
  )
}

export function getCurrentNetworkOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine
}

export function isNetworkOffline() {
  return !getCurrentNetworkOnline()
}

export function isMobileViewport() {
  return window.matchMedia("(max-width: 1023.98px)").matches
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

export function pruneEmailRenderCache(
  cache: Map<string, EmailRenderCacheEntry>
) {
  while (cache.size > emailRenderCacheLimit) {
    const oldestKey = cache.keys().next().value

    if (!oldestKey) {
      return
    }

    cache.delete(oldestKey)
  }
}

export function linkifyText(text: string) {
  const parts: Array<{ type: "text" | "link"; value: string }> = []
  const urlPattern = /(https?:\/\/[^\s<>()]+|mailto:[^\s<>()]+|tel:[^\s<>()]+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = urlPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        value: text.slice(lastIndex, match.index),
      })
    }

    const linkValue = trimTrailingPunctuation(match[0])
    const suffix = match[0].slice(linkValue.length)

    parts.push({
      type: "link",
      value: linkValue,
    })

    if (suffix) {
      parts.push({
        type: "text",
        value: suffix,
      })
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      value: text.slice(lastIndex),
    })
  }

  return parts
}

export function trimTrailingPunctuation(value: string) {
  return value.replace(/[),.;:!?]+$/, "")
}

export function handleRequestError(
  error: unknown,
  setErrorMessage: (message: string | null) => void,
  setAuthStatus: (status: "checking" | "authenticated" | "anonymous") => void
) {
  if (isApplicationAuthError(error)) {
    setAuthStatus("anonymous")
    return
  }

  if (isRequestError(error) && error.status === 502) {
    setErrorMessage(null)
    return
  }

  setErrorMessage(getErrorMessage(error))
}

export function handleBackgroundRequestError(
  error: unknown,
  setAuthStatus: (status: "checking" | "authenticated" | "anonymous") => void
) {
  if (isApplicationAuthError(error)) {
    setAuthStatus("anonymous")
    return
  }

  console.warn("Background mail refresh failed", getErrorMessage(error))
}

export function isRequestError(error: unknown): error is RequestError {
  return error instanceof Error && "status" in error
}

export function isApplicationAuthError(error: unknown) {
  return (
    isRequestError(error) &&
    error.status === 401 &&
    error.code !== "invalid_provider_credentials"
  )
}

export function isCloseWindowShortcut(event: KeyboardEvent) {
  return (
    !event.altKey &&
    !event.shiftKey &&
    (event.metaKey || event.ctrlKey) &&
    (event.key.toLowerCase() === "w" || event.code === "KeyW")
  )
}

export function getErrorMessage(error: unknown) {
  if (isRequestError(error)) {
    if (error.code === "invalid_provider_credentials") {
      return mailText(
        "Переподключите почтовый ящик в настройках",
        "Reconnect your mailbox in settings"
      )
    }

    if (error.code === "mail_provider_unavailable") {
      return mailText(
        "Почтовый сервер временно недоступен. Попробуйте ещё раз позже",
        "Mail server is temporarily unavailable. Try again later"
      )
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return mailText("Неизвестная ошибка", "Unknown error")
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function withSubjectPrefix(
  subject: string | null,
  prefix: "Re:" | "Fwd:"
) {
  const normalizedSubject =
    subject?.trim() || mailText("Без темы", "No subject")

  if (normalizedSubject.toLowerCase().startsWith(prefix.toLowerCase())) {
    return normalizedSubject
  }

  return `${prefix} ${normalizedSubject}`
}

export function buildForwardHtml(message: MessageDto) {
  const body = message.html ?? escapeHtml(message.text ?? message.snippet ?? "")

  const sender = escapeHtml(formatAddress(message.from))
  const heading = mailText(
    `Пересланное письмо от ${sender}`,
    `Forwarded message from ${sender}`
  )
  return `<br><br><blockquote><p>${heading}</p>${body}</blockquote>`
}

export function buildPlainTextEmailHtml(text: string) {
  const body = linkifyText(text)
    .map((part) =>
      part.type === "link"
        ? `<a href="${escapeHtml(part.value)}">${escapeHtml(part.value)}</a>`
        : escapeHtml(part.value)
    )
    .join("")

  return `<div style="max-width: 64rem; white-space: pre-wrap; overflow-wrap: anywhere;">${body}</div>`
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function formatAddress(address: MailAddress | null | undefined) {
  if (!address) {
    return mailText("Неизвестный отправитель", "Unknown sender")
  }

  if (address.name) {
    return `${address.name} · ${address.address}`
  }

  return address.address
}

export function getAttachmentDownloadName(attachment: AttachmentDto) {
  return attachment.filename?.trim() || "attachment"
}

export function getEmailRenderPreferenceKey(
  address: string | null | undefined,
  messageId: string | null
) {
  const normalizedAddress = address?.trim().toLowerCase()
  const domain = normalizedAddress?.split("@")[1]

  if (domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
    return `domain:${getBaseDomain(domain)}`
  }

  if (normalizedAddress) {
    return `address:${normalizedAddress}`
  }

  if (messageId) {
    return `message:${messageId}`
  }

  return null
}
