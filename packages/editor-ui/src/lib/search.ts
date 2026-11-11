import type { SearchToken } from "../types/search"

export type SearchFilterValue = string | boolean

export type SearchChipsValue<TKey extends string = string> = {
  text: string
  filters: Partial<Record<TKey, SearchFilterValue>>
}

export type SearchFilterDefinition<TKey extends string = string> = {
  key: TKey
  label: string
  type?: "boolean" | "date" | "text"
  placeholder?: string
  aliases?: string[]
  quick?: boolean
}

export type SearchChip<TKey extends string = string> = {
  key: TKey
  label: string
  value: string
}

export const emptySearchChipsValue: SearchChipsValue = {
  text: "",
  filters: {},
}

export function getSearchChips<TKey extends string>(
  value: SearchChipsValue<TKey>,
  definitions: SearchFilterDefinition<TKey>[]
): SearchChip<TKey>[] {
  return definitions.flatMap((definition) => {
    const filterValue = value.filters[definition.key]

    if (typeof filterValue === "boolean") {
      return filterValue
        ? [
            {
              key: definition.key,
              label: definition.label,
              value: "",
            },
          ]
        : []
    }

    const stringValue = filterValue?.trim() ?? ""

    return stringValue
      ? [
          {
            key: definition.key,
            label: definition.label,
            value:
              definition.type === "date"
                ? normalizeSearchDate(stringValue)
                : stringValue,
          },
        ]
      : []
  })
}

export function removeSearchChip<TKey extends string>(
  value: SearchChipsValue<TKey>,
  key: TKey
): SearchChipsValue<TKey> {
  const nextFilters = {
    ...value.filters,
  }

  delete nextFilters[key]

  return {
    ...value,
    filters: nextFilters,
  }
}

export function clearSearchChipsValue<
  TKey extends string,
>(): SearchChipsValue<TKey> {
  return {
    filters: {},
    text: "",
  }
}

export function hasActiveSearchValue<TKey extends string>(
  value: SearchChipsValue<TKey>,
  definitions: SearchFilterDefinition<TKey>[]
) {
  return (
    Boolean(value.text.trim()) || getSearchChips(value, definitions).length > 0
  )
}

export function applySearchSyntax<TKey extends string>(
  value: SearchChipsValue<TKey>,
  definitions: SearchFilterDefinition<TKey>[]
): SearchChipsValue<TKey> {
  const parts = splitSearchParts(value.text)
  const textParts: string[] = []
  let nextValue = value

  for (const part of parts) {
    const parsed = parseSearchPart(part, definitions)

    if (!parsed) {
      textParts.push(part)
      continue
    }

    nextValue = {
      ...nextValue,
      filters: {
        ...nextValue.filters,
        [parsed.key]: parsed.value,
      },
    }
  }

  return {
    ...nextValue,
    text: textParts.join(" ").trim(),
  }
}

export function parseSearchTokens<TKey extends string>(
  input: string,
  definitions: SearchFilterDefinition<TKey>[]
): SearchToken[] {
  return searchChipsValueToTokens(
    applySearchSyntax(
      {
        filters: {},
        text: input,
      },
      definitions
    ),
    definitions
  )
}

export function serializeSearchTokens(tokens: SearchToken[]) {
  return tokens.map(serializeSearchToken).filter(Boolean).join(" ")
}

export function searchChipsValueToTokens<TKey extends string>(
  value: SearchChipsValue<TKey>,
  definitions: SearchFilterDefinition<TKey>[]
): SearchToken[] {
  const tokens: SearchToken[] = []
  const text = value.text.trim()

  if (text) {
    tokens.push({
      type: "text",
      value: text,
    })
  }

  for (const definition of definitions) {
    const filterValue = value.filters[definition.key]

    if (
      filterValue === undefined ||
      filterValue === false ||
      filterValue === ""
    ) {
      continue
    }

    if (typeof filterValue === "boolean") {
      tokens.push({
        field: definition.key,
        type: "flag",
      })
      continue
    }

    if (definition.type === "date") {
      tokens.push({
        field: definition.key,
        op: readDateOperator(definition.key),
        type: "date",
        value: normalizeSearchDate(filterValue),
      })
      continue
    }

    tokens.push({
      field: definition.key,
      type: "field",
      value: filterValue.trim(),
    })
  }

  return tokens
}

export function searchTokensToChipsValue<TKey extends string>(
  tokens: SearchToken[]
): SearchChipsValue<TKey> {
  const text: string[] = []
  const filters: Partial<Record<TKey, SearchFilterValue>> = {}

  for (const token of tokens) {
    if (token.type === "text") {
      text.push(token.value)
      continue
    }

    if (token.type === "flag") {
      filters[token.field as TKey] = token.value ?? true
      continue
    }

    filters[token.field as TKey] =
      token.type === "date" ? normalizeSearchDate(token.value) : token.value
  }

  return {
    filters,
    text: text.join(" ").trim(),
  }
}

export function formatSearchChip(chip: SearchChip) {
  return chip.value ? `${chip.label}: ${chip.value}` : chip.label
}

export function normalizeSearchDate(value: string) {
  const trimmed = value.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(trimmed)

  if (!match) {
    return trimmed
  }

  const [, day, month, year] = match

  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`
}

function parseSearchPart<TKey extends string>(
  part: string,
  definitions: SearchFilterDefinition<TKey>[]
): { key: TKey; value: SearchFilterValue } | null {
  const normalizedPart = trimQuotes(part.trim())
  const lowerPart = normalizedPart.toLowerCase()
  const separatorIndex = normalizedPart.indexOf(":")

  for (const definition of definitions) {
    if (definition.type !== "boolean") {
      continue
    }

    const aliases = getDefinitionAliases(definition)

    if (
      aliases.some(
        (alias) =>
          lowerPart === `${alias}:true` ||
          lowerPart === `is:${alias}` ||
          lowerPart === `has:${alias}`
      )
    ) {
      return {
        key: definition.key,
        value: true,
      }
    }
  }

  if (separatorIndex <= 0) {
    return null
  }

  const key = normalizedPart.slice(0, separatorIndex).toLowerCase()
  const rawValue = trimQuotes(normalizedPart.slice(separatorIndex + 1))

  if (!rawValue) {
    return null
  }

  const definition = definitions.find((candidate) =>
    getDefinitionAliases(candidate).includes(key)
  )

  if (!definition) {
    return null
  }

  return {
    key: definition.key,
    value:
      definition.type === "date" ? normalizeSearchDate(rawValue) : rawValue,
  }
}

function getDefinitionAliases<TKey extends string>(
  definition: SearchFilterDefinition<TKey>
) {
  return [definition.key, ...(definition.aliases ?? [])].map((alias) =>
    alias.toLowerCase()
  )
}

function splitSearchParts(value: string) {
  const parts: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(value)) !== null) {
    parts.push(match[1] ?? match[2] ?? match[3] ?? "")
  }

  return parts.filter(Boolean)
}

function trimQuotes(value: string) {
  return value.replace(/^["']|["']$/g, "").trim()
}

function readDateOperator(field: string): "after" | "before" | "on" {
  if (field.toLowerCase().includes("before")) {
    return "before"
  }

  if (field.toLowerCase().includes("after")) {
    return "after"
  }

  return "on"
}

function serializeSearchToken(token: SearchToken) {
  if (token.type === "text") {
    return quoteSearchValue(token.value)
  }

  if (token.type === "flag") {
    return token.value
      ? `${token.field}:${quoteSearchValue(token.value)}`
      : `is:${token.field}`
  }

  if (token.type === "date") {
    return `${token.op}:${quoteSearchValue(normalizeSearchDate(token.value))}`
  }

  return `${token.field}:${quoteSearchValue(token.value)}`
}

function quoteSearchValue(value: string) {
  const trimmed = value.trim()

  if (!/\s/.test(trimmed)) {
    return trimmed
  }

  return `"${trimmed.replace(/"/g, '\\"')}"`
}
