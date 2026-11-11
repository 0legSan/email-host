import type { MessagePageRequest } from "@/lib/api-client"

export type SettingsRouteTab =
  | "accounts"
  | "add-account"
  | "profiles"
  | "signatures"
  | "users"
  | "offline"
  | "application"
  | "appearance"
export type ComposeRouteMode = "new" | "reply" | "forward"

export type MailRouteSearch = {
  accountId?: string
  profileId?: string
  path?: string
  specialUse?: string
  customFolders?: boolean
  searchMode?: boolean
  q?: string
  from?: string
  to?: string
  subject?: string
  after?: string
  before?: string
  hasAttachments?: boolean
  searchUnread?: boolean
  searchFlagged?: boolean
  unread?: boolean
  flagged?: boolean
  drawer?: "menu"
  settings?: SettingsRouteTab
  compose?: ComposeRouteMode
  referenceMessageId?: string
  mailto?: string
}

export type MailRouteSearchPatch = {
  [Key in keyof MailRouteSearch]?: MailRouteSearch[Key] | null
}

export type NormalizedMailRouteSearch = {
  accountId: string | null
  profileId: string | null
  path: string | null
  specialUse: string | null
  customFolders: boolean
  searchMode: boolean
  q: string
  from: string
  to: string
  subject: string
  after: string
  before: string
  hasAttachments: boolean
  searchUnread: boolean
  searchFlagged: boolean
  unread: boolean
  flagged: boolean
  drawer: "menu" | null
  settings: SettingsRouteTab | null
  compose: ComposeRouteMode | null
  referenceMessageId: string | null
  mailto: string | null
}

const defaultSpecialUse = "\\Inbox"
const searchKeys = [
  "accountId",
  "profileId",
  "path",
  "specialUse",
  "customFolders",
  "searchMode",
  "q",
  "from",
  "to",
  "subject",
  "after",
  "before",
  "hasAttachments",
  "searchUnread",
  "searchFlagged",
  "unread",
  "flagged",
  "drawer",
  "settings",
  "compose",
  "referenceMessageId",
  "mailto",
] as const

export const defaultMailRouteSearch: NormalizedMailRouteSearch = {
  accountId: null,
  profileId: null,
  path: null,
  specialUse: defaultSpecialUse,
  customFolders: false,
  searchMode: false,
  q: "",
  from: "",
  to: "",
  subject: "",
  after: "",
  before: "",
  hasAttachments: false,
  searchUnread: false,
  searchFlagged: false,
  unread: false,
  flagged: false,
  drawer: null,
  settings: null,
  compose: null,
  referenceMessageId: null,
  mailto: null,
}

export function parseMailRouteSearch(
  search: Record<string, unknown>
): MailRouteSearch {
  return toMailRouteSearch(normalizeMailRouteSearch(search))
}

export function parseSettingsRouteSearch(search: Record<string, unknown>) {
  const parsed = parseMailRouteSearch(search)
  return { ...parsed, settings: parsed.settings ?? ("accounts" as const) }
}

export function parseAddAccountRouteSearch(search: Record<string, unknown>) {
  return { ...parseMailRouteSearch(search), settings: "add-account" as const }
}

// The message stays in the path so returning from settings also works after reload.
export function getMailRouteDestination(
  search: MailRouteSearch,
  messageId: string | null
) {
  if (messageId) {
    return {
      to:
        search.settings === "add-account"
          ? ("/mail/message/$messageId/settings/accounts/new" as const)
          : search.settings
            ? ("/mail/message/$messageId/settings" as const)
            : ("/mail/message/$messageId" as const),
      params: { messageId },
      search,
    }
  }
  return {
    to:
      search.settings === "add-account"
        ? ("/mail/settings/accounts/new" as const)
        : search.settings
          ? ("/mail/settings" as const)
          : ("/mail" as const),
    search,
  }
}

export function normalizeMailRouteSearch(
  search: Partial<MailRouteSearch> | Record<string, unknown> | null | undefined
): NormalizedMailRouteSearch {
  const source = search ?? {}
  const q = readString(source.q) ?? ""
  const from = readString(source.from) ?? ""
  const to = readString(source.to) ?? ""
  const subject = readString(source.subject) ?? ""
  const after = readDateString(source.after) ?? ""
  const before = readDateString(source.before) ?? ""
  const hasAttachments = readBoolean(source.hasAttachments)
  const searchUnread = readBoolean(source.searchUnread)
  const searchFlagged = readBoolean(source.searchFlagged)
  const searchMode =
    readBoolean(source.searchMode) ||
    Boolean(
      q ||
      from ||
      to ||
      subject ||
      after ||
      before ||
      hasAttachments ||
      searchUnread ||
      searchFlagged
    )
  const customFolders = readBoolean(source.customFolders)
  const flagged = readBoolean(source.flagged)
  const unread = readBoolean(source.unread)
  const profileId = customFolders ? null : readString(source.profileId)
  const accountId =
    customFolders || profileId ? null : readString(source.accountId)
  const path =
    accountId && !customFolders && !flagged ? readString(source.path) : null
  const specialUse =
    customFolders || path || flagged
      ? null
      : (readString(source.specialUse) ?? defaultSpecialUse)

  return {
    accountId,
    profileId,
    path,
    specialUse,
    customFolders,
    searchMode,
    q,
    from,
    to,
    subject,
    after,
    before,
    hasAttachments,
    searchUnread,
    searchFlagged,
    unread,
    flagged,
    drawer: source.drawer === "menu" ? "menu" : null,
    settings: readSettingsTab(source.settings),
    compose: readComposeMode(source.compose),
    referenceMessageId: readString(source.referenceMessageId),
    mailto: readString(source.mailto),
  }
}

export function toMailRouteSearch(
  search: NormalizedMailRouteSearch
): MailRouteSearch {
  const next: MailRouteSearch = {}

  if (search.accountId) {
    next.accountId = search.accountId
  }

  if (search.profileId) {
    next.profileId = search.profileId
  }

  if (search.path) {
    next.path = search.path
  }

  if (search.specialUse && search.specialUse !== defaultSpecialUse) {
    next.specialUse = search.specialUse
  }

  if (search.customFolders) {
    next.customFolders = true
  }

  if (search.searchMode) {
    next.searchMode = true
  }

  if (search.q) {
    next.q = search.q
  }

  if (search.from) {
    next.from = search.from
  }

  if (search.to) {
    next.to = search.to
  }

  if (search.subject) {
    next.subject = search.subject
  }

  if (search.after) {
    next.after = search.after
  }

  if (search.before) {
    next.before = search.before
  }

  if (search.hasAttachments) {
    next.hasAttachments = true
  }

  if (search.searchUnread) {
    next.searchUnread = true
  }

  if (search.searchFlagged) {
    next.searchFlagged = true
  }

  if (search.unread) {
    next.unread = true
  }

  if (search.flagged) {
    next.flagged = true
  }

  if (search.drawer) {
    next.drawer = search.drawer
  }

  if (search.settings) {
    next.settings = search.settings
  }

  if (search.compose) {
    next.compose = search.compose
  }

  if (search.referenceMessageId) {
    next.referenceMessageId = search.referenceMessageId
  }

  if (search.mailto) {
    next.mailto = search.mailto
  }

  return next
}

export function updateMailRouteSearch(
  current:
    Partial<MailRouteSearch> | Record<string, unknown> | null | undefined,
  patch: MailRouteSearchPatch
) {
  const next: Record<string, unknown> = {
    ...toMailRouteSearch(normalizeMailRouteSearch(current)),
  }

  for (const key of searchKeys) {
    if (!(key in patch)) {
      continue
    }

    const value = patch[key]

    if (value === null || value === undefined || value === false) {
      delete next[key]
    } else {
      next[key] = value
    }
  }

  return toMailRouteSearch(normalizeMailRouteSearch(next))
}

export function mailRouteSearchToMessagePageRequest(
  search: NormalizedMailRouteSearch,
  profileAccountIds: string[]
): MessagePageRequest {
  const searching = search.searchMode && hasMailSearchCriteria(search)

  return {
    accountId: search.accountId,
    accountIds: search.profileId ? profileAccountIds : null,
    searchMode: searching,
    path: searching ? null : search.path,
    specialUse: searching ? null : search.specialUse,
    customFolders: searching ? false : search.customFolders,
    q: search.q,
    from: search.from,
    to: search.to,
    subject: search.subject,
    after: search.after,
    before: search.before,
    hasAttachments: search.hasAttachments,
    unread: searching ? search.searchUnread : search.unread,
    flagged: searching ? search.searchFlagged : search.flagged,
  }
}

export function getMailRouteListScopeKey(
  search: NormalizedMailRouteSearch,
  profileAccountIds: string[]
) {
  return JSON.stringify({
    accountId: search.accountId,
    profileId: search.profileId,
    profileAccountIds,
    path: search.path,
    specialUse: search.specialUse,
    customFolders: search.customFolders,
    searchMode: search.searchMode,
    q: search.q,
    from: search.from,
    to: search.to,
    subject: search.subject,
    after: search.after,
    before: search.before,
    hasAttachments: search.hasAttachments,
    searchUnread: search.searchUnread,
    searchFlagged: search.searchFlagged,
    unread: search.unread,
    flagged: search.flagged,
  })
}

export function hasMailSearchCriteria(search: NormalizedMailRouteSearch) {
  return Boolean(
    search.q ||
    search.from ||
    search.to ||
    search.subject ||
    search.after ||
    search.before ||
    search.hasAttachments ||
    search.searchUnread ||
    search.searchFlagged
  )
}

export function getMailMessageIdFromPath(pathname: string) {
  const match =
    /^\/mail\/message\/([^/]+)(?:\/settings(?:\/accounts\/new)?)?$/.exec(
      pathname
    )

  return match ? decodeURIComponent(match[1]) : null
}

function readString(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function readDateString(value: unknown) {
  const stringValue = readString(value)

  return stringValue && /^\d{4}-\d{2}-\d{2}$/.test(stringValue)
    ? stringValue
    : null
}

function readBoolean(value: unknown) {
  return value === true || value === "true" || value === "1"
}

function readSettingsTab(value: unknown): SettingsRouteTab | null {
  return value === "accounts" ||
    value === "add-account" ||
    value === "profiles" ||
    value === "signatures" ||
    value === "users" ||
    value === "offline" ||
    value === "application" ||
    value === "appearance"
    ? value
    : null
}

function readComposeMode(value: unknown): ComposeRouteMode | null {
  return value === "new" || value === "reply" || value === "forward"
    ? value
    : null
}
