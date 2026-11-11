import {
  getMailLocale,
  mailText,
  type MailLocale,
} from "@workspace/mail-design/locale"
import type {
  SearchChipsValue,
  SearchFilterDefinition,
} from "@workspace/editor-ui"

import type {
  MailRouteSearchPatch,
  NormalizedMailRouteSearch,
} from "@/lib/mail-route-state"

export type MailSearchFilterKey =
  | "after"
  | "before"
  | "flagged"
  | "from"
  | "hasAttachments"
  | "subject"
  | "to"
  | "unread"

export type MailSearchValue = SearchChipsValue<MailSearchFilterKey>

export function getMailSearchFilters(
  locale: MailLocale = getMailLocale()
): SearchFilterDefinition<MailSearchFilterKey>[] {
  return [
    {
      aliases: ["sender"],
      key: "from",
      label: mailText("От", "From", locale),
      placeholder: "name@example.com",
    },
    {
      aliases: ["recipient"],
      key: "to",
      label: mailText("Кому", "To", locale),
      placeholder: "name@example.com",
    },
    {
      aliases: ["subj"],
      key: "subject",
      label: mailText("Тема", "Subject", locale),
      placeholder: mailText(
        "счет, договор, пароль",
        "invoice, contract, password",
        locale
      ),
    },
    {
      aliases: ["newer"],
      key: "after",
      label: mailText("После", "After", locale),
      placeholder: "2026-01-01",
      type: "date",
    },
    {
      aliases: ["older"],
      key: "before",
      label: mailText("До", "Before", locale),
      placeholder: "2026-12-31",
      type: "date",
    },
    {
      aliases: ["attachment", "attachments"],
      key: "hasAttachments",
      label: mailText("С вложениями", "Has attachments", locale),
      quick: true,
      type: "boolean",
    },
    {
      aliases: ["unread"],
      key: "unread",
      label: mailText("Непрочитано", "Unread", locale),
      quick: true,
      type: "boolean",
    },
    {
      aliases: ["flagged", "starred"],
      key: "flagged",
      label: mailText("Отмеченные", "Starred", locale),
      quick: true,
      type: "boolean",
    },
  ]
}

export function routeSearchToMailSearchValue(
  search: NormalizedMailRouteSearch,
  text: string
): MailSearchValue {
  return {
    text,
    filters: {
      ...(search.from ? { from: search.from } : {}),
      ...(search.to ? { to: search.to } : {}),
      ...(search.subject ? { subject: search.subject } : {}),
      ...(search.after ? { after: search.after } : {}),
      ...(search.before ? { before: search.before } : {}),
      ...(search.hasAttachments ? { hasAttachments: true } : {}),
      ...(search.searchUnread ? { unread: true } : {}),
      ...(search.searchFlagged ? { flagged: true } : {}),
    },
  }
}

export function mailSearchValueToRoutePatch(
  value: MailSearchValue
): MailRouteSearchPatch {
  return {
    after: readStringFilter(value, "after"),
    before: readStringFilter(value, "before"),
    searchFlagged: readBooleanFilter(value, "flagged") || null,
    from: readStringFilter(value, "from"),
    hasAttachments: readBooleanFilter(value, "hasAttachments") || null,
    q: value.text.trim() || null,
    searchMode: true,
    subject: readStringFilter(value, "subject"),
    to: readStringFilter(value, "to"),
    searchUnread: readBooleanFilter(value, "unread") || null,
  }
}

export function mailSearchFiltersChanged(
  value: MailSearchValue,
  search: NormalizedMailRouteSearch
) {
  return (
    (readStringFilter(value, "from") ?? "") !== search.from ||
    (readStringFilter(value, "to") ?? "") !== search.to ||
    (readStringFilter(value, "subject") ?? "") !== search.subject ||
    (readStringFilter(value, "after") ?? "") !== search.after ||
    (readStringFilter(value, "before") ?? "") !== search.before ||
    readBooleanFilter(value, "hasAttachments") !== search.hasAttachments ||
    readBooleanFilter(value, "unread") !== search.searchUnread ||
    readBooleanFilter(value, "flagged") !== search.searchFlagged
  )
}

export function hasMailSearchFilters(search: NormalizedMailRouteSearch) {
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

function readStringFilter(value: MailSearchValue, key: MailSearchFilterKey) {
  const filterValue = value.filters[key]

  return typeof filterValue === "string" && filterValue.trim()
    ? filterValue.trim()
    : null
}

function readBooleanFilter(value: MailSearchValue, key: MailSearchFilterKey) {
  return value.filters[key] === true
}
