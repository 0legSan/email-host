import * as React from "react"
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react"
import {
  calendarDays,
  formatCalendarDate,
  parseCalendarDate,
  shiftCalendarMonth,
} from "@workspace/ui/lib/calendar"
import { useUiLocale } from "@workspace/ui/lib/ui-locale"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

type DatePickerProps = {
  id?: string
  label: string
  value: string
  placeholder?: string
  onValueChange: (value: string) => void
}

export function DatePicker({
  id,
  label,
  value,
  placeholder,
  onValueChange,
}: DatePickerProps) {
  const locale = useUiLocale()
  const ru = locale === "ru"
  const intlLocale = ru ? "ru-RU" : "en-US"
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState({ source: value, text: value })
  const [touched, setTouched] = React.useState(false)
  const [focusedDate, setFocusedDate] = React.useState(
    () => parseCalendarDate(value) ?? new Date()
  )
  const calendarRef = React.useRef<HTMLDivElement>(null)
  if (draft.source !== value) setDraft({ source: value, text: value })
  const invalid = touched && draft.text !== "" && !parseCalendarDate(draft.text)
  const focusedValue = formatCalendarDate(focusedDate)
  const days = calendarDays(focusedDate, ru ? 1 : 0)
  const today = formatCalendarDate(new Date())
  const dateLabel = (date: Date) =>
    date.toLocaleDateString(intlLocale, { dateStyle: "full" })

  React.useEffect(() => {
    if (open)
      calendarRef.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${focusedValue}"]`)
        ?.focus()
  }, [open, focusedValue])

  function choose(date: string) {
    setDraft({ source: date, text: date })
    setTouched(false)
    onValueChange(date)
    setOpen(false)
  }

  function moveFocus(event: React.KeyboardEvent) {
    const next = new Date(focusedDate)
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      event.key
    ]
    if (offset !== undefined) next.setDate(next.getDate() + offset)
    else if (event.key === "Home" || event.key === "End") {
      const day = (next.getDay() - (ru ? 1 : 0) + 7) % 7
      next.setDate(next.getDate() - day + (event.key === "End" ? 6 : 0))
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      const shifted = shiftCalendarMonth(
        next,
        (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1)
      )
      next.setTime(shifted.getTime())
    } else return
    event.preventDefault()
    if (next.getFullYear() >= 1 && next.getFullYear() <= 9999)
      setFocusedDate(next)
  }

  return (
    <div className="grid min-w-0 gap-1">
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setFocusedDate(parseCalendarDate(value) ?? new Date())
          setOpen(nextOpen)
        }}
      >
        <div className="flex min-w-0 items-center">
          <Input
            id={inputId}
            className="h-9 border-r-0 text-sm"
            type="text"
            autoComplete="off"
            placeholder={placeholder ?? "YYYY-MM-DD"}
            maxLength={10}
            value={draft.text}
            aria-invalid={Boolean(invalid)}
            aria-describedby={invalid ? `${inputId}-date-error` : undefined}
            onBlur={() => setTouched(true)}
            onChange={(event) => {
              const text = event.target.value
              const valid = text === "" || parseCalendarDate(text) !== null
              setDraft({ source: valid ? text : value, text })
              if (valid) onValueChange(text)
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && draft.text !== value) {
                event.preventDefault()
                event.stopPropagation()
                setDraft({ source: value, text: value })
                setTouched(false)
              }
            }}
          />
          <PopoverTrigger asChild>
            <Button
              className="size-9 shrink-0"
              variant="outline"
              size="icon"
              type="button"
              aria-label={`${ru ? "Выбрать дату" : "Choose date"}: ${label}`}
            >
              <IconCalendar className="size-4" />
            </Button>
          </PopoverTrigger>
        </div>
        <PopoverContent
          aria-label={`${ru ? "Календарь" : "Calendar"}: ${label}`}
          className="w-76"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            calendarRef.current
              ?.querySelector<HTMLButtonElement>(
                `[data-date="${focusedValue}"]`
              )
              ?.focus()
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              disabled={
                focusedDate.getFullYear() === 1 && focusedDate.getMonth() === 0
              }
              aria-label={ru ? "Предыдущий месяц" : "Previous month"}
              onClick={() =>
                setFocusedDate(shiftCalendarMonth(focusedDate, -1))
              }
            >
              <IconChevronLeft className="size-4" />
            </Button>
            <span className="text-sm font-semibold" aria-live="polite">
              {focusedDate.toLocaleDateString(intlLocale, {
                month: "long",
                year: "numeric",
              })}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              type="button"
              disabled={
                focusedDate.getFullYear() === 9999 &&
                focusedDate.getMonth() === 11
              }
              aria-label={ru ? "Следующий месяц" : "Next month"}
              onClick={() => setFocusedDate(shiftCalendarMonth(focusedDate, 1))}
            >
              <IconChevronRight className="size-4" />
            </Button>
          </div>
          <div
            ref={calendarRef}
            role="grid"
            aria-label={label}
            onKeyDown={moveFocus}
          >
            <div role="row" className="grid grid-cols-7">
              {days.slice(0, 7).map((date) => (
                <span
                  key={date.getDay()}
                  role="columnheader"
                  className="py-2 text-center text-xs text-muted-foreground"
                >
                  {date.toLocaleDateString(intlLocale, { weekday: "short" })}
                </span>
              ))}
            </div>
            {Array.from({ length: 6 }, (_, week) => (
              <div key={week} role="row" className="grid grid-cols-7">
                {days.slice(week * 7, week * 7 + 7).map((date) => {
                  const dayValue = formatCalendarDate(date)
                  return (
                    <button
                      key={dayValue}
                      data-date={dayValue}
                      role="gridcell"
                      type="button"
                      tabIndex={dayValue === focusedValue ? 0 : -1}
                      aria-label={dateLabel(date)}
                      aria-selected={value === dayValue}
                      aria-current={today === dayValue ? "date" : undefined}
                      disabled={
                        date.getFullYear() < 1 || date.getFullYear() > 9999
                      }
                      className={cn(
                        "h-9 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-30",
                        date.getMonth() !== focusedDate.getMonth() &&
                          "text-muted-foreground",
                        value === dayValue &&
                          "bg-primary text-primary-foreground hover:bg-primary",
                        today === dayValue &&
                          "font-bold underline underline-offset-4"
                      )}
                      onFocus={() => {
                        if (dayValue !== focusedValue) setFocusedDate(date)
                      }}
                      onClick={() => choose(dayValue)}
                    >
                      {date.getDate()}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between gap-2 border-t border-border pt-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => choose(today)}
            >
              {ru ? "Сегодня" : "Today"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => choose("")}
            >
              {ru ? "Очистить" : "Clear"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {invalid && (
        <span
          id={`${inputId}-date-error`}
          role="status"
          className="text-xs text-destructive"
        >
          {ru
            ? "Введите существующую дату в формате ГГГГ-ММ-ДД."
            : "Enter a valid date in YYYY-MM-DD format."}
        </span>
      )}
    </div>
  )
}
