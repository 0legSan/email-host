import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { useUiLocale } from "@workspace/ui/lib/ui-locale"

type InvalidReason =
  | "required"
  | "email"
  | "url"
  | "min"
  | "max"
  | "step"
  | "short"
  | "long"
  | "invalid"

function invalidReason(input: HTMLInputElement): InvalidReason | null {
  const validity = input.validity
  if (validity.valid) return null
  if (validity.valueMissing) return "required"
  if (validity.typeMismatch && input.type === "email") return "email"
  if (validity.typeMismatch && input.type === "url") return "url"
  if (validity.rangeUnderflow) return "min"
  if (validity.rangeOverflow) return "max"
  if (validity.stepMismatch) return "step"
  if (validity.tooShort) return "short"
  if (validity.tooLong) return "long"
  return "invalid"
}

function Input({
  className,
  type,
  id,
  onInvalid,
  onChange,
  ...props
}: React.ComponentProps<"input">) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const locale = useUiLocale()
  const [failure, setFailure] = React.useState<{
    reason: InvalidReason
    value: string
  } | null>(null)
  const reason =
    failure &&
    (props.value === undefined || String(props.value) === failure.value)
      ? failure.reason
      : null
  const messages =
    locale === "ru"
      ? {
          required: "Заполните это поле.",
          email: "Введите адрес электронной почты.",
          url: "Введите полный адрес ссылки, например https://example.com.",
          min: `Введите число не меньше ${props.min}.`,
          max: `Введите число не больше ${props.max}.`,
          step: `Допустимый шаг: ${props.step ?? 1}.`,
          short: `Введите не меньше ${props.minLength} символов.`,
          long: `Введите не больше ${props.maxLength} символов.`,
          invalid: "Проверьте значение поля.",
        }
      : {
          required: "Fill in this field.",
          email: "Enter an email address.",
          url: "Enter a full URL, for example https://example.com.",
          min: `Enter a number greater than or equal to ${props.min}.`,
          max: `Enter a number less than or equal to ${props.max}.`,
          step: `Use increments of ${props.step ?? 1}.`,
          short: `Enter at least ${props.minLength} characters.`,
          long: `Enter no more than ${props.maxLength} characters.`,
          invalid: "Check this field's value.",
        }
  return (
    <>
      <input
        {...props}
        id={inputId}
        type={type}
        data-slot="input"
        aria-invalid={reason ? true : props["aria-invalid"]}
        aria-describedby={
          [props["aria-describedby"], reason ? `${inputId}-error` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        className={cn(
          "h-8 w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 py-1 text-xs transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-xs dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className
        )}
        style={
          type === "number"
            ? { appearance: "textfield", ...props.style }
            : props.style
        }
        onInvalid={(event) => {
          onInvalid?.(event)
          // Keep HTML constraints and submission blocking, but render the error ourselves.
          event.preventDefault()
          const reason = invalidReason(event.currentTarget)
          if (reason) setFailure({ reason, value: event.currentTarget.value })
          const form = event.currentTarget.form
          if (!form || form.querySelector(":invalid") === event.currentTarget)
            event.currentTarget.focus()
        }}
        onChange={(event) => {
          if (failure) {
            const reason = invalidReason(event.currentTarget)
            setFailure(
              reason ? { reason, value: event.currentTarget.value } : null
            )
          }
          onChange?.(event)
        }}
      />
      {reason && (
        <span
          id={`${inputId}-error`}
          data-slot="input-error"
          role="status"
          className="text-xs font-normal text-destructive"
        >
          {messages[reason]}
        </span>
      )}
    </>
  )
}

export { Input }
