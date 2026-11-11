export type MailTextSearchCriteria = {
  q?: string
  from?: string
  to?: string
  subject?: string
}

export type MailTextSearchField = "all" | "from" | "subject" | "to"

export type MailTextSearchPlan = {
  field: MailTextSearchField
  query: string
}

export type MailTextSearchDocument = {
  searchText: string
  fromSearch: string
  toSearch: string
  subjectSearch: string
}

export type MailSearchIndexFilterCriteria<TAccountId> = {
  accountId?: TAccountId
  hasAttachments?: boolean
  unread?: boolean
  flagged?: boolean
}

export function getMailSearchIndexEqualityFilters<TAccountId>(
  criteria: MailSearchIndexFilterCriteria<TAccountId>
) {
  return {
    accountId: criteria.accountId,
    visible: true as const,
    hasAttachments: criteria.hasAttachments,
    seen: criteria.unread ? (false as const) : undefined,
    flagged: criteria.flagged ? (true as const) : undefined,
  }
}

export function getMailTextSearchPlan(
  criteria: MailTextSearchCriteria
): MailTextSearchPlan | null {
  const normalized = normalizeMailTextSearchCriteria(criteria)

  if (normalized.q) return { field: "all", query: normalized.q }
  if (normalized.subject) {
    return {
      field: "subject",
      query: getFieldSearchCandidateQuery(normalized.subject),
    }
  }
  if (normalized.from) {
    return {
      field: "from",
      query: getFieldSearchCandidateQuery(normalized.from),
    }
  }
  if (normalized.to) {
    return {
      field: "to",
      query: getFieldSearchCandidateQuery(normalized.to),
    }
  }

  return null
}

export function matchesSecondaryMailTextCriteria(
  document: MailTextSearchDocument,
  criteria: MailTextSearchCriteria,
  primaryField: MailTextSearchField | null
) {
  const normalized = normalizeMailTextSearchCriteria(criteria)

  return (
    (primaryField === "all" ||
      !normalized.q ||
      document.searchText.toLocaleLowerCase().includes(normalized.q)) &&
    (!normalized.from ||
      document.fromSearch.toLocaleLowerCase().includes(normalized.from)) &&
    (!normalized.to ||
      document.toSearch.toLocaleLowerCase().includes(normalized.to)) &&
    (!normalized.subject ||
      document.subjectSearch.toLocaleLowerCase().includes(normalized.subject))
  )
}

function getFieldSearchCandidateQuery(value: string) {
  const emailAddress = value.match(/[^\s<>()@]+@[^\s<>()@]+/)?.[0]
  if (emailAddress) return emailAddress

  const terms = value.match(/[a-zа-яё0-9]+/gi) ?? []

  return terms.sort((left, right) => right.length - left.length)[0] ?? value
}

function normalizeMailTextSearchCriteria(criteria: MailTextSearchCriteria) {
  return {
    q: normalize(criteria.q),
    from: normalize(criteria.from),
    to: normalize(criteria.to),
    subject: normalize(criteria.subject),
  }
}

function normalize(value: string | undefined) {
  return value?.trim().toLocaleLowerCase() ?? ""
}
