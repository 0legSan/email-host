import { lazy, Suspense, useId, useState } from "react"
import { useMailLocale } from "../../i18n/use-mail-locale"
import { MailLanguagePicker } from "../../i18n/language-controls"
import { normalizeHexColor } from "./accent-colors"
import { MAIL_ACCENTS } from "./appearance-storage"
import { useMailTheme, type MailTheme } from "./theme-provider"

const ColorPicker = lazy(() =>
  import("@workspace/ui/components/color-picker").then((module) => ({
    default: module.ColorPicker,
  }))
)

type AppearanceProps = { locale?: "ru" | "en"; showLanguage?: boolean }
const labels = {
  ru: {
    accent: "Акцентный цвет",
    custom: "Свой цвет",
    hex: "HEX",
    invalidHex: "Введите # и 6 цифр или букв от A до F. Например, #167450.",
    restore: "Вернуть текущий цвет",
    theme: "Тема",
    light: "Светлая",
    dark: "Темная",
    system: "Как на устройстве",
    green: "Зеленый",
    blue: "Синий",
    violet: "Фиолетовый",
    orange: "Оранжевый",
    rose: "Розовый",
    graphite: "Графитовый",
    hint: "Изменения видны сразу и сохраняются в этом браузере на этом устройстве.",
    error:
      "Не удалось сохранить настройки в браузере. Изменения действуют до закрытия страницы.",
    preview: "Предпросмотр",
    inbox: "Входящие",
    message: "Ваши письма в одном месте",
    compose: "Написать письмо",
  },
  en: {
    accent: "Accent color",
    custom: "Custom color",
    hex: "HEX",
    invalidHex:
      "Enter # followed by 6 digits or letters A to F. For example, #167450.",
    restore: "Restore current color",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "Use device setting",
    green: "Green",
    blue: "Blue",
    violet: "Violet",
    orange: "Orange",
    rose: "Rose",
    graphite: "Graphite",
    hint: "Changes apply immediately and are saved only in this browser on this device.",
    error:
      "Could not save settings in this browser. Changes apply until you close the page.",
    preview: "Preview",
    inbox: "Inbox",
    message: "All your mail in one place",
    compose: "Compose",
  },
}
const swatches = {
  green: "#167450",
  blue: "#245ac2",
  violet: "#7140bd",
  orange: "#a64c0b",
  rose: "#b32e63",
  graphite: "#4e5968",
}
const choiceClass =
  "min-h-11 border border-mail-border px-3 py-2 text-sm text-mail-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mail-accent-text"

export function MailAccentPicker({ locale: explicitLocale }: AppearanceProps) {
  const { locale: currentLocale } = useMailLocale()
  const locale = explicitLocale ?? currentLocale
  const { accent, setAccent } = useMailTheme()
  const copy = labels[locale]
  const id = useId()
  const currentHex =
    normalizeHexColor(accent) ?? swatches[accent as keyof typeof swatches]
  const [input, setInput] = useState({ source: accent, draft: currentHex })
  if (input.source !== accent) setInput({ source: accent, draft: currentHex })
  const invalid = normalizeHexColor(input.draft) === null
  function changeHex(value: string) {
    const valid = normalizeHexColor(value)
    setInput({ source: valid ?? accent, draft: value })
    if (valid) setAccent(valid)
  }
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-3 text-sm font-semibold">{copy.accent}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MAIL_ACCENTS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={accent === value}
            className={
              choiceClass +
              " flex items-center gap-2 " +
              (accent === value
                ? "border-mail-accent bg-mail-accent-soft font-semibold"
                : "bg-mail-panel hover:bg-mail-hover")
            }
            onClick={() => setAccent(value)}
          >
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-full"
              style={{ backgroundColor: swatches[value] }}
            />
            {copy[value]}
            {accent === value ? (
              <span aria-hidden="true" className="ml-auto">
                ✓
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1 text-sm">
          <span>{copy.custom}</span>
          <Suspense
            fallback={
              <span
                className="border-mail-border h-11 w-16 border"
                aria-busy="true"
              />
            }
          >
            <ColorPicker value={currentHex} onValueChange={changeHex} />
          </Suspense>
        </div>
        <label className="grid min-w-0 gap-1 text-sm" htmlFor={id}>
          {copy.hex}
          <input
            id={id}
            data-accent-hex
            type="text"
            value={input.draft}
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-error` : undefined}
            className={choiceClass + " bg-mail-panel w-36 font-mono"}
            onChange={(event) => changeHex(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && invalid) {
                event.preventDefault()
                event.stopPropagation()
                setInput({ source: accent, draft: currentHex })
              }
            }}
          />
        </label>
        {invalid ? (
          <button
            type="button"
            className={choiceClass}
            onClick={() => setInput({ source: accent, draft: currentHex })}
          >
            {copy.restore}
          </button>
        ) : null}
      </div>
      {invalid ? (
        <p
          id={`${id}-error`}
          role="status"
          className="text-mail-danger text-sm"
        >
          {copy.invalidHex}
        </p>
      ) : null}
    </fieldset>
  )
}

export function MailAppearanceSettings({
  locale: explicitLocale,
  showLanguage = true,
}: AppearanceProps) {
  const { locale: currentLocale } = useMailLocale()
  const locale = explicitLocale ?? currentLocale
  const { theme, setTheme, appearanceSaved } = useMailTheme()
  const copy = labels[locale]
  return (
    <div className="text-mail-text grid max-w-3xl gap-6">
      <p className="text-mail-text-muted text-sm leading-6">{copy.hint}</p>
      {showLanguage && <MailLanguagePicker />}
      <fieldset>
        <legend className="mb-3 text-sm font-semibold">{copy.theme}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["light", "dark", "system"] satisfies MailTheme[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              className={
                choiceClass +
                " " +
                (theme === value
                  ? "border-mail-accent bg-mail-accent-soft font-semibold"
                  : "bg-mail-panel hover:bg-mail-hover")
              }
              onClick={() => setTheme(value)}
            >
              {copy[value]}
              {theme === value ? " ✓" : ""}
            </button>
          ))}
        </div>
      </fieldset>
      <MailAccentPicker locale={locale} />
      <section
        aria-label={copy.preview}
        className="border-mail-border bg-mail-panel-subtle grid gap-4 border p-4"
      >
        <h3 className="text-mail-text-muted text-xs font-semibold">
          {copy.preview}
        </h3>
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <span className="bg-mail-accent text-mail-accent-foreground px-3 py-2 text-sm font-semibold">
            {copy.inbox}
          </span>
          <span className="border-mail-accent bg-mail-accent-soft border-l-2 px-3 py-2 text-sm">
            {copy.message}
          </span>
        </div>
        <span className="bg-mail-accent text-mail-accent-foreground w-fit px-4 py-2 text-sm font-semibold">
          {copy.compose}
        </span>
      </section>
      <p role="status" className="text-mail-danger text-sm">
        {appearanceSaved ? "" : copy.error}
      </p>
    </div>
  )
}
