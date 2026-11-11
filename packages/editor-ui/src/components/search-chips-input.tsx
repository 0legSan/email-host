import * as React from "react"

import {
  applySearchSyntax,
  clearSearchChipsValue,
  formatSearchChip,
  getSearchChips,
  hasActiveSearchValue,
  removeSearchChip,
  type SearchChipsValue,
  type SearchFilterDefinition,
  type SearchFilterValue,
} from "../lib/search"
import type { SearchLabels } from "../types/search"

// Calendar code is needed only for expanded search filters, outside the PWA entry chunk.
const DatePicker = React.lazy(() =>
  import("@workspace/ui/components/date-picker").then((module) => ({
    default: module.DatePicker,
  }))
)

export type SearchChipsInputProps<TKey extends string = string> = {
  filters: SearchFilterDefinition<TKey>[]
  value: SearchChipsValue<TKey>
  placeholder?: string
  inputLabel?: string
  filterButtonLabel?: string
  clearButtonLabel?: string
  leadingIcon?: React.ReactNode
  className?: string
  labels?: Partial<SearchLabels>
  parse?: (
    value: SearchChipsValue<TKey>,
    filters: SearchFilterDefinition<TKey>[]
  ) => SearchChipsValue<TKey>
  serialize?: (
    value: SearchChipsValue<TKey>,
    filters: SearchFilterDefinition<TKey>[]
  ) => string
  onChange: (value: SearchChipsValue<TKey>) => void
  onClose?: () => void
}

export const SearchChipsInput = React.forwardRef(function SearchChipsInput<
  TKey extends string = string,
>(
  {
    className,
    clearButtonLabel = "Очистить поиск",
    filterButtonLabel = "Настройки поиска",
    filters,
    inputLabel = "Поиск",
    labels,
    leadingIcon,
    parse,
    placeholder = "Поиск",
    value,
    onChange,
    onClose,
  }: SearchChipsInputProps<TKey>,
  ref: React.ForwardedRef<HTMLInputElement>
) {
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const chips = getSearchChips(value, filters)
  const active = hasActiveSearchValue(value, filters)
  const resolvedClearButtonLabel = labels?.clear ?? clearButtonLabel
  const resolvedFilterButtonLabel = labels?.filters ?? filterButtonLabel
  const resolvedInputLabel = labels?.input ?? inputLabel
  const fieldFilters = filters.filter(
    (filter) => (filter.type ?? "text") !== "boolean"
  )
  const quickFilters = filters.filter(
    (filter) => filter.quick || filter.type === "boolean"
  )

  const updateText = React.useCallback(
    (text: string) => {
      onChange({
        ...value,
        text,
      })
    },
    [onChange, value]
  )

  const updateFilter = React.useCallback(
    (key: TKey, filterValue: SearchFilterValue | undefined) => {
      const nextFilters = {
        ...value.filters,
      }

      if (
        filterValue === undefined ||
        filterValue === false ||
        filterValue === ""
      ) {
        delete nextFilters[key]
      } else {
        nextFilters[key] = filterValue
      }

      onChange({
        ...value,
        filters: nextFilters,
      })
    },
    [onChange, value]
  )

  const applySyntax = React.useCallback(() => {
    onChange(parse ? parse(value, filters) : applySearchSyntax(value, filters))
  }, [filters, onChange, parse, value])

  const clearSearch = React.useCallback(() => {
    onChange(clearSearchChipsValue<TKey>())
  }, [onChange])

  return (
    <div
      className={["editor-ui editor-ui-search", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="editor-ui-search__control">
        {leadingIcon ? (
          <span className="editor-ui-search__leading" aria-hidden="true">
            {leadingIcon}
          </span>
        ) : null}

        <div className="editor-ui-search__tokens">
          {chips.map((chip) => (
            <span className="editor-ui-search__chip" key={chip.key}>
              <span className="editor-ui-search__chip-label">
                {formatSearchChip(chip)}
              </span>
              <button
                aria-label={`${labels?.remove ?? "Убрать фильтр"}: ${formatSearchChip(chip)}`}
                className="editor-ui-search__chip-remove"
                type="button"
                onClick={() => onChange(removeSearchChip(value, chip.key))}
              >
                ×
              </button>
            </span>
          ))}

          <input
            ref={ref}
            aria-label={resolvedInputLabel}
            className="editor-ui-search__input"
            placeholder={chips.length > 0 ? "" : placeholder}
            value={value.text}
            onBlur={applySyntax}
            onChange={(event) => updateText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                applySyntax()
                return
              }

              if (
                event.key === "Backspace" &&
                value.text.length === 0 &&
                chips.length > 0
              ) {
                event.preventDefault()
                onChange(removeSearchChip(value, chips[chips.length - 1]!.key))
                return
              }

              if (event.key === "Escape") {
                event.preventDefault()
                onClose?.()
              }
            }}
          />
        </div>

        <div className="editor-ui-search__actions">
          {filters.length > 0 ? (
            <button
              aria-label={resolvedFilterButtonLabel}
              aria-pressed={filtersOpen}
              className="editor-ui-icon-button"
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
            >
              ≡
            </button>
          ) : null}
          {active ? (
            <button
              aria-label={resolvedClearButtonLabel}
              className="editor-ui-icon-button"
              type="button"
              onClick={clearSearch}
            >
              ×
            </button>
          ) : null}
          {onClose ? (
            <button
              aria-label={labels?.close ?? "Закрыть поиск"}
              className="editor-ui-icon-button"
              type="button"
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      {filtersOpen ? (
        <div className="editor-ui-search__filters">
          {fieldFilters.length > 0 ? (
            <div className="editor-ui-search__filters-grid">
              {fieldFilters.map((filter) => (
                <SearchField
                  key={filter.key}
                  filter={filter}
                  value={value.filters[filter.key]}
                  onChange={(filterValue) =>
                    updateFilter(filter.key, filterValue)
                  }
                />
              ))}
            </div>
          ) : null}

          {quickFilters.length > 0 ? (
            <div className="editor-ui-search__quick">
              {quickFilters.map((filter) => {
                const active = Boolean(value.filters[filter.key])

                return (
                  <QuickFilter
                    active={active}
                    key={filter.key}
                    label={filter.label}
                    onClick={() =>
                      updateFilter(filter.key, active ? undefined : true)
                    }
                  />
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}) as <TKey extends string = string>(
  props: SearchChipsInputProps<TKey> & {
    ref?: React.ForwardedRef<HTMLInputElement>
  }
) => React.ReactElement

function SearchField<TKey extends string>({
  filter,
  value,
  onChange,
}: {
  filter: SearchFilterDefinition<TKey>
  value: SearchFilterValue | undefined
  onChange: (value: SearchFilterValue | undefined) => void
}) {
  const id = React.useId()
  const stringValue = typeof value === "string" ? value : ""

  return (
    <div className="editor-ui-search__field">
      <label htmlFor={id}>{filter.label}</label>
      {filter.type === "date" ? (
        <React.Suspense fallback={<div className="h-9" aria-busy="true" />}>
          <DatePicker
            id={id}
            label={filter.label}
            placeholder={filter.placeholder}
            value={stringValue}
            onValueChange={(date) => onChange(date || undefined)}
          />
        </React.Suspense>
      ) : (
        <input
          id={id}
          placeholder={filter.placeholder}
          type="text"
          value={stringValue}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      )}
    </div>
  )
}

function QuickFilter({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-pressed={active}
      className="editor-ui-search__quick-button"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}
