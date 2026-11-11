import { useEffect, useId, type ReactNode } from "react"
import { UiLocaleContext } from "@workspace/ui/lib/ui-locale"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useMailLocale } from "./use-mail-locale"

export function MailDocumentLanguage({ children }: { children?: ReactNode }) {
  const { locale } = useMailLocale()
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return <UiLocaleContext value={locale}>{children}</UiLocaleContext>
}

export function MailLanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, localeSaved, t } = useMailLocale()
  const id = useId()
  if (compact)
    return (
      <div className="inline-flex items-center gap-2 text-xs">
        <label htmlFor={id}>{t("Язык", "Language")}</label>
        <Select
          value={locale}
          onValueChange={(value) => setLocale(value === "en" ? "en" : "ru")}
        >
          <SelectTrigger
            id={id}
            aria-label={t("Язык", "Language")}
            className="border-mail-border bg-mail-panel text-mail-text min-h-8 min-w-28"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            <SelectItem value="ru">Русский</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
    )
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 text-sm font-semibold">
        {t("Язык приложения", "App language")}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {(["ru", "en"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={locale === value}
            onClick={() => setLocale(value)}
            className={`border-mail-border text-mail-text min-h-11 border px-3 py-2 text-sm ${locale === value ? "bg-mail-accent-soft font-semibold" : "bg-mail-panel hover:bg-mail-hover"}`}
          >
            {value === "ru" ? "Русский" : "English"}
            {locale === value ? " ✓" : ""}
          </button>
        ))}
      </div>
      {!localeSaved && (
        <p role="status" className="text-mail-danger text-sm">
          {t(
            "Не удалось сохранить язык в браузере. Выбор действует до закрытия страницы.",
            "Could not save the language in this browser. Your choice applies until you close the page."
          )}
        </p>
      )}
    </fieldset>
  )
}
