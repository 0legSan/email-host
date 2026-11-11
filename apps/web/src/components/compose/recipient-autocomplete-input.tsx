import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import {
  findContactSuggestions,
  getContactInitial,
  getCurrentRecipientToken,
} from "./compose-editor-utils"
import type { MailContactDto } from "@/lib/api-client"

export function RecipientAutocompleteInput({
  className,
  contacts,
  id,
  onChange,
  placeholder,
  value,
}: {
  className?: string
  contacts: MailContactDto[]
  id: string
  onChange: (value: string) => void
  placeholder?: string
  value: string
}) {
  const { t } = useMailLocale()

  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const listboxId = React.useId()
  const recipientToken = React.useMemo(
    () => getCurrentRecipientToken(value),
    [value]
  )
  const suggestions = React.useMemo(
    () =>
      findContactSuggestions(
        contacts,
        recipientToken.query,
        value.slice(0, recipientToken.start)
      ),
    [contacts, recipientToken, value]
  )
  const suggestionsVisible =
    open && recipientToken.query.length > 0 && suggestions.length > 0
  const resolvedActiveIndex = Math.min(
    activeIndex,
    Math.max(0, suggestions.length - 1)
  )
  const activeSuggestion = suggestions[resolvedActiveIndex]

  function selectContact(contact: MailContactDto) {
    const prefix = value.slice(0, recipientToken.start)
    const spacedPrefix = prefix && !/\s$/.test(prefix) ? `${prefix} ` : prefix

    onChange(`${spacedPrefix}${contact.address}, `)
    setOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestionsVisible) {
      // Confirming a recipient must not submit the entire compose form.
      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
        event.preventDefault()
      }
      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((resolvedActiveIndex + 1) % suggestions.length)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex(
        (resolvedActiveIndex - 1 + suggestions.length) % suggestions.length
      )
      return
    }

    if (event.key === "Enter" || event.key === "Tab") {
      if (!activeSuggestion) {
        return
      }

      event.preventDefault()
      selectContact(activeSuggestion)
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        aria-activedescendant={
          suggestionsVisible ? `${listboxId}-${resolvedActiveIndex}` : undefined
        }
        aria-autocomplete="list"
        aria-controls={suggestionsVisible ? listboxId : undefined}
        aria-expanded={suggestionsVisible}
        autoComplete="off"
        className={className}
        id={id}
        placeholder={placeholder}
        ref={inputRef}
        role="combobox"
        value={value}
        onBlur={() => setOpen(false)}
        onChange={(event) => {
          onChange(event.target.value)
          setActiveIndex(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {suggestionsVisible ? (
        <div
          aria-label={t("Известные контакты", "Known contacts")}
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-[#d8dee5] bg-white py-1 shadow-[0_18px_48px_rgba(20,28,36,0.18)] dark:border-[#30353a] dark:bg-[#181b1f]"
          id={listboxId}
          role="listbox"
        >
          {suggestions.map((contact, index) => (
            <div
              aria-selected={index === resolvedActiveIndex}
              className={cn(
                "flex cursor-default items-center gap-3 px-3 py-2 text-left text-sm",
                index === resolvedActiveIndex
                  ? "bg-[#edf2f5] text-[#20252a] dark:bg-[#242a30] dark:text-[#eef2f4]"
                  : "text-[#20252a] hover:bg-[#f6f8f9] dark:text-[#eef2f4] dark:hover:bg-[#20252a]"
              )}
              id={`${listboxId}-${index}`}
              key={contact.address.toLocaleLowerCase()}
              role="option"
              onClick={() => selectContact(contact)}
              onPointerDown={(event) => event.preventDefault()}
              onPointerEnter={() => setActiveIndex(index)}
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#e8f5f1] text-xs font-bold text-[#176d59] dark:bg-[#132722] dark:text-[#7ed8bf]">
                {getContactInitial(contact)}
              </span>
              <span className="min-w-0 flex-1">
                {contact.name ? (
                  <span className="block truncate font-medium">
                    {contact.name}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "block truncate",
                    contact.name
                      ? "text-xs text-[#68727d] dark:text-[#a7b0ba]"
                      : "font-medium"
                  )}
                >
                  {contact.address}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
