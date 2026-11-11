import { formatUiMessage, type UiMessage } from "../ui-message"
import { useMailLocale } from "@workspace/mail-design"
import { mailText, getMailIntlLocale } from "@workspace/mail-design/locale"
import * as React from "react"
import IconAlertCircle from "@tabler/icons-react/dist/esm/icons/IconAlertCircle.mjs"
import IconCheck from "@tabler/icons-react/dist/esm/icons/IconCheck.mjs"
import IconCopy from "@tabler/icons-react/dist/esm/icons/IconCopy.mjs"
import IconDeviceDesktop from "@tabler/icons-react/dist/esm/icons/IconDeviceDesktop.mjs"
import IconExternalLink from "@tabler/icons-react/dist/esm/icons/IconExternalLink.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconMail from "@tabler/icons-react/dist/esm/icons/IconMail.mjs"
import IconTrash from "@tabler/icons-react/dist/esm/icons/IconTrash.mjs"
import type {
  OfflineMailCacheSettings,
  OfflineMailCacheStatus,
} from "@/lib/offline-mail-cache"
import type { MailtoHandlerRegistrationOutcome } from "@/lib/mailto-protocol-handler"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import {
  OfflineCacheStatusRow,
  SettingsError,
  SettingsField,
  SettingsSelectField,
} from "./settings-shared"

const settingsInputClassName =
  "h-10 rounded-none border-[#cfd6dd] bg-white text-[#20252a] shadow-none focus-visible:border-mail-accent focus-visible:ring-mail-accent/20 dark:border-[#3a424b] dark:bg-[#111315] dark:text-[#eef2f4]"
const settingsSelectTriggerClassName = `${settingsInputClassName} !h-10 justify-between`

export function ApplicationSettingsPanel({
  applicationOrigin,
  installAvailable,
  installed,
  mailtoRegistrationAvailable,
  onInstall,
  onRegisterMailtoHandler,
}: {
  applicationOrigin: string
  installAvailable: boolean
  installed: boolean
  mailtoRegistrationAvailable: boolean
  onInstall: () => Promise<"accepted" | "dismissed" | "unavailable">
  onRegisterMailtoHandler: () => MailtoHandlerRegistrationOutcome
}) {
  const { t } = useMailLocale()

  const [installing, setInstalling] = React.useState(false)
  const [statusMessage, setStatusMessage] = React.useState<UiMessage | null>(
    null
  )
  const [error, setError] = React.useState<UiMessage | null>(null)
  const [mailtoStatusMessage, setMailtoStatusMessage] =
    React.useState<UiMessage | null>(null)
  const [mailtoError, setMailtoError] = React.useState<UiMessage | null>(null)
  const [copyStatusMessage, setCopyStatusMessage] =
    React.useState<UiMessage | null>(null)
  const [copyError, setCopyError] = React.useState<UiMessage | null>(null)

  async function handleInstall() {
    setInstalling(true)
    setStatusMessage(null)
    setError(null)

    try {
      const outcome = await onInstall()

      if (outcome === "accepted") {
        setStatusMessage([
          "Установка Email Host подтверждена.",
          "Email Host installation confirmed.",
        ])
      } else if (outcome === "dismissed") {
        setStatusMessage(["Установка отменена.", "Installation cancelled."])
      } else {
        setError([
          "Браузер не открыл установку. Используйте команду «Установить приложение» в его меню.",
          "The browser did not start installation. Choose Install app in its menu.",
        ])
      }
    } catch {
      setError([
        "Не удалось открыть установку. Используйте команду «Установить приложение» в меню браузера.",
        "Could not start installation. Choose Install app in the browser menu.",
      ])
    } finally {
      setInstalling(false)
    }
  }

  function handleRegisterMailtoHandler() {
    setMailtoStatusMessage(null)
    setMailtoError(null)

    const outcome = onRegisterMailtoHandler()

    if (outcome === "requested") {
      setMailtoStatusMessage([
        "Запрос отправлен браузеру. Подтвердите его в адресной строке или настройках браузера.",
        "Request sent to the browser. Confirm it in the address bar or browser settings.",
      ])
    } else if (outcome === "unsupported") {
      setMailtoError([
        "Этот браузер не позволяет зарегистрировать почтовые ссылки. Откройте Email Host в Chrome или Vivaldi.",
        "This browser cannot register email links. Open Email Host in Chrome or Vivaldi.",
      ])
    } else {
      setMailtoError([
        "Не удалось зарегистрировать почтовые ссылки. Проверьте разрешения сайта в браузере и попробуйте снова.",
        "Could not register email links. Check site permissions in your browser and try again.",
      ])
    }
  }

  async function handleCopyApplicationAddress() {
    setCopyStatusMessage(null)
    setCopyError(null)

    try {
      await navigator.clipboard.writeText(applicationOrigin)
      setCopyStatusMessage([
        "Адрес Email Host скопирован.",
        "Email Host address copied.",
      ])
    } catch {
      setCopyError([
        `Не удалось скопировать адрес. Скопируйте его вручную: ${applicationOrigin}`,
        `Could not copy the address. Copy it manually: ${applicationOrigin}`,
      ])
    }
  }

  return (
    <div className="grid min-w-0 gap-6 @3xl/settings:grid-cols-2">
      <section className="grid min-w-0 content-start gap-4 border border-[#d8dee5] bg-[#fbfcfd] p-4 dark:border-[#30353a] dark:bg-[#131619]">
        <div>
          <h3 className="text-sm font-semibold">
            {t("Установка", "Installation")}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#68727d] dark:text-[#a7b0ba]">
            {t(
              "Установленное приложение открывается в отдельном окне и доступно из меню приложений устройства.",
              "The installed app opens in a separate window and appears in your device's app menu."
            )}{" "}
          </p>
        </div>

        {installed ? (
          <div className="flex items-center gap-2 border border-[#b8d9c4] bg-[#eef8f1] p-3 text-sm text-[#245d38] dark:border-[#315c40] dark:bg-[#17271c] dark:text-[#a8dbb6]">
            <IconCheck className="size-4" />
            {t(
              "Email Host запущен как установленное приложение.",
              "Email Host is running as an installed app."
            )}{" "}
          </div>
        ) : installAvailable ? (
          <Button
            className="justify-self-start"
            disabled={installing}
            type="button"
            onClick={() => void handleInstall()}
          >
            {installing ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconDeviceDesktop className="size-4" />
            )}
            {t("Установить Email Host", "Install Email Host")}{" "}
          </Button>
        ) : (
          <p className="border border-[#e2e7eb] bg-white p-3 text-sm leading-6 text-[#4c5661] dark:border-[#2b3035] dark:bg-[#181b1f] dark:text-[#c4ccd4]">
            {t(
              "Откройте меню браузера и выберите «Установить приложение». В Safari на iPhone и iPad выберите «На экран Домой» в меню «Поделиться».",
              "Open the browser menu and choose Install app. In Safari on iPhone and iPad, choose Add to Home Screen in the Share menu."
            )}{" "}
          </p>
        )}

        {statusMessage ? (
          <p
            aria-live="polite"
            className="text-sm text-[#4c5661] dark:text-[#c4ccd4]"
          >
            {formatUiMessage(statusMessage)}
          </p>
        ) : null}
        {error ? <SettingsError>{formatUiMessage(error)}</SettingsError> : null}
      </section>

      <section className="grid min-w-0 content-start gap-4 border border-[#d8dee5] bg-[#fbfcfd] p-4 dark:border-[#30353a] dark:bg-[#131619]">
        <div>
          <h3 className="text-sm font-semibold">
            {t("Почтовое приложение по умолчанию", "Default email app")}{" "}
          </h3>
          <p className="mt-1 text-sm leading-6 text-[#68727d] dark:text-[#a7b0ba]">
            {t(
              "Email Host может открывать ссылки mailto: и переносить адресатов, копии, тему и текст в новое письмо.",
              "Email Host can open mailto: links and fill in recipients, Cc, subject and text in a new message."
            )}{" "}
          </p>
        </div>

        {mailtoRegistrationAvailable ? (
          <>
            <div className="flex items-start gap-3 border border-[#b8d9c4] bg-[#eef8f1] p-3 text-sm text-[#245d38] dark:border-[#315c40] dark:bg-[#17271c] dark:text-[#a8dbb6]">
              <IconCheck className="mt-0.5 size-4 shrink-0" />
              <p>
                {t(
                  "Эта версия PWA поддерживает регистрацию почтовых ссылок.",
                  "This PWA version supports email link registration."
                )}
              </p>
            </div>

            <ol className="grid list-decimal gap-2 pl-5 text-sm leading-6 text-[#4c5661] dark:text-[#c4ccd4]">
              <li>
                {t(
                  "Нажмите «Зарегистрировать обработчик mailto».",
                  "Select Register mailto handler."
                )}
              </li>
              <li>
                {t(
                  "Подтвердите запрос браузера.",
                  "Confirm the browser prompt."
                )}
              </li>
              <li>
                {t(
                  "На Mac выберите этот браузер в Почте: «Настройки» → «Основные» → «Почтовый клиент по умолчанию».",
                  "On Mac, select this browser in Mail: Settings → General → Default email reader."
                )}{" "}
              </li>
              <li>{t("Проверьте тестовую ссылку.", "Open the test link.")}</li>
            </ol>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleRegisterMailtoHandler}>
                <IconMail className="size-4" />
                {t(
                  "Зарегистрировать обработчик mailto",
                  "Register mailto handler"
                )}{" "}
              </Button>
              <Button asChild variant="secondary">
                <a
                  href={t(
                    "mailto:?subject=Проверка%20Email%20Host",
                    "mailto:?subject=Email%20Host%20test"
                  )}
                >
                  <IconExternalLink className="size-4" />
                  {t("Проверить ссылку mailto", "Test mailto link")}{" "}
                </a>
              </Button>
            </div>

            {mailtoStatusMessage ? (
              <p
                aria-live="polite"
                className="text-sm text-[#4c5661] dark:text-[#c4ccd4]"
              >
                {formatUiMessage(mailtoStatusMessage)}
              </p>
            ) : null}
            {mailtoError ? (
              <SettingsError>{formatUiMessage(mailtoError)}</SettingsError>
            ) : null}

            <p className="border border-[#e2e7eb] bg-white p-3 text-xs leading-5 text-[#4c5661] dark:border-[#2b3035] dark:bg-[#181b1f] dark:text-[#c4ccd4]">
              {t(
                "В macOS выбирайте браузер, через который установлен Email Host, а не приложение Email Host.app.",
                "On macOS, select the browser used to install Email Host, rather than Email Host.app."
              )}{" "}
            </p>
          </>
        ) : (
          <>
            <div
              className="flex items-start gap-3 border border-[#e4b4a8] bg-[#fff5f2] p-3 text-sm text-[#a8422d] dark:border-[#6b3b31] dark:bg-[#2b1b18] dark:text-[#f0aa99]"
              role="status"
            >
              <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {t(
                    "Эта PWA не может стать почтовым приложением по умолчанию.",
                    "This PWA cannot become the default email app."
                  )}{" "}
                </p>
                <p className="mt-1 leading-6">
                  {t(
                    "Safari не поддерживает регистрацию ссылок mailto: для PWA. Safari-версию можно использовать для обычной работы и push-уведомлений.",
                    "Safari does not support mailto: registration for PWAs. You can still use the Safari version for email and push notifications."
                  )}{" "}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold">
                {t(
                  "Если Email Host нужен по умолчанию",
                  "To use Email Host by default"
                )}{" "}
              </h4>
              <p className="mt-1 text-sm leading-6 text-[#4c5661] dark:text-[#c4ccd4]">
                {t(
                  "Установите PWA не через Safari, а через Vivaldi, Chrome, Edge или Brave.",
                  "Install the PWA through Vivaldi, Chrome, Edge or Brave."
                )}{" "}
              </p>
            </div>

            <ol className="grid list-decimal gap-2 pl-5 text-sm leading-6 text-[#4c5661] dark:text-[#c4ccd4]">
              <li>
                {t(
                  "Скопируйте адрес Email Host.",
                  "Copy the Email Host address."
                )}
              </li>
              <li>
                {t(
                  "Откройте его в одном из поддерживаемых браузеров.",
                  "Open it in a supported browser."
                )}
              </li>
              <li>
                {t(
                  "Установите Email Host через меню этого браузера.",
                  "Install Email Host through that browser's menu."
                )}
              </li>
              <li>
                {t(
                  "В новой PWA откройте этот экран и зарегистрируйте обработчик mailto.",
                  "In the new PWA, open this screen and register the mailto handler."
                )}{" "}
              </li>
            </ol>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => void handleCopyApplicationAddress()}
              >
                <IconCopy className="size-4" />
                {t(
                  "Скопировать адрес Email Host",
                  "Copy Email Host address"
                )}{" "}
              </Button>
              <code className="min-w-0 text-xs break-all text-[#68727d] dark:text-[#a7b0ba]">
                {applicationOrigin}
              </code>
            </div>

            {copyStatusMessage ? (
              <p
                aria-live="polite"
                className="text-sm text-[#4c5661] dark:text-[#c4ccd4]"
              >
                {formatUiMessage(copyStatusMessage)}
              </p>
            ) : null}
            {copyError ? (
              <SettingsError>{formatUiMessage(copyError)}</SettingsError>
            ) : null}
          </>
        )}

        <p className="text-xs leading-5 text-[#68727d] dark:text-[#a7b0ba]">
          {t(
            "На iPhone, iPad и в некоторых Android-браузерах установленная PWA не появляется в списке системных почтовых приложений. В этом случае назначить её приложением по умолчанию нельзя — это ограничение платформы.",
            "On iPhone, iPad and some Android browsers, the installed PWA does not appear among system email apps. The platform does not allow it to become the default app."
          )}{" "}
        </p>
      </section>
    </div>
  )
}

export function OfflineCacheSettingsPanel({
  clearing,
  error,
  saving,
  settings,
  status,
  onChange,
  onClear,
  onSubmit,
}: {
  clearing: boolean
  error: string | null
  saving: boolean
  settings: OfflineMailCacheSettings
  status: OfflineMailCacheStatus | null
  onChange: React.Dispatch<React.SetStateAction<OfflineMailCacheSettings>>
  onClear: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  const { t } = useMailLocale()

  const enabledCheckboxId = React.useId()

  return (
    <div className="grid min-w-0 gap-6 @3xl/settings:grid-cols-[minmax(0,1fr)_320px]">
      <form
        className="grid min-w-0 content-start gap-4 border border-[#d8dee5] bg-[#fbfcfd] p-4 dark:border-[#30353a] dark:bg-[#131619]"
        onSubmit={onSubmit}
      >
        <h3 className="text-sm font-semibold">
          {t("Офлайн-доступ", "Offline access")}
        </h3>

        <div className="flex items-center gap-3 border border-[#e2e7eb] bg-white p-3 dark:border-[#2b3035] dark:bg-[#181b1f]">
          <Checkbox
            checked={settings.enabled}
            id={enabledCheckboxId}
            onCheckedChange={(checked) =>
              onChange((currentSettings) => ({
                ...currentSettings,
                enabled: checked === true,
              }))
            }
          />
          <Label
            className="text-sm font-semibold text-[#30363d] dark:text-[#d7dde3]"
            htmlFor={enabledCheckboxId}
          >
            {t("Включить офлайн-кеш", "Enable offline cache")}{" "}
          </Label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SettingsSelectField label={t("Что хранить", "What to store")}>
            <Select
              value={settings.messageMode}
              onValueChange={(value) =>
                onChange((currentSettings) => ({
                  ...currentSettings,
                  messageMode: value as OfflineMailCacheSettings["messageMode"],
                }))
              }
            >
              <SelectTrigger className={settingsSelectTriggerClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent-and-opened">
                  {t("Открытые и последние", "Opened and recent")}{" "}
                </SelectItem>
                <SelectItem value="opened">
                  {t("Только открытые", "Opened only")}
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingsSelectField>
          <SettingsField label={t("Период, суток", "Period, days")}>
            <Input
              className={settingsInputClassName}
              inputMode="numeric"
              max={90}
              min={1}
              type="number"
              value={settings.retentionDays}
              onChange={(event) =>
                onChange((currentSettings) => ({
                  ...currentSettings,
                  retentionDays: Number(event.target.value),
                }))
              }
            />
          </SettingsField>
          <SettingsField
            label={t("Минимум последних писем", "Minimum recent messages")}
          >
            <Input
              className={settingsInputClassName}
              inputMode="numeric"
              max={5000}
              min={50}
              type="number"
              value={settings.maxMessages}
              onChange={(event) =>
                onChange((currentSettings) => ({
                  ...currentSettings,
                  maxMessages: Number(event.target.value),
                }))
              }
            />
          </SettingsField>
        </div>

        <p className="text-xs leading-5 text-[#66717c] dark:text-[#9ca6b0]">
          {t(
            "Кеш хранит письма за указанный период и не меньше заданного количества последних писем, даже если они старше.",
            "The cache stores messages for the selected period and at least the specified number of recent messages, even if they are older."
          )}{" "}
        </p>

        {error ? <SettingsError>{formatUiMessage(error)}</SettingsError> : null}

        <div className="flex justify-end">
          <Button disabled={saving} type="submit">
            {saving ? <IconLoader2 className="size-4 animate-spin" /> : null}
            {t("Сохранить", "Save")}{" "}
          </Button>
        </div>
      </form>

      <section className="border border-[#d8dee5] bg-[#fbfcfd] p-4 dark:border-[#30353a] dark:bg-[#131619]">
        <h3 className="mb-3 text-sm font-semibold">
          {t("Локальный кеш", "Local cache")}
        </h3>
        <dl className="grid gap-2 text-sm">
          <OfflineCacheStatusRow
            label={t("Писем с телом", "Messages with body")}
            value={formatOfflineCacheCount(status?.messageDetailCount)}
          />
          <OfflineCacheStatusRow
            label={t("Писем в списках", "Messages in lists")}
            value={formatOfflineCacheCount(status?.messageListItemCount)}
          />
          <OfflineCacheStatusRow
            label={t("Списков", "Lists")}
            value={formatOfflineCacheCount(status?.messageListCount)}
          />
          <OfflineCacheStatusRow
            label={t("Обновлен", "Updated")}
            value={formatOfflineCacheDate(status?.lastUpdatedAt)}
          />
        </dl>
        <Button
          className="mt-4 w-full"
          disabled={clearing}
          type="button"
          variant="destructive"
          onClick={onClear}
        >
          {clearing ? (
            <IconLoader2 className="size-4 animate-spin" />
          ) : (
            <IconTrash className="size-4" />
          )}
          {t("Очистить кеш", "Clear cache")}{" "}
        </Button>
      </section>
    </div>
  )
}

function formatOfflineCacheCount(value: number | null | undefined) {
  return new Intl.NumberFormat(getMailIntlLocale()).format(value ?? 0)
}

function formatOfflineCacheDate(value: string | null | undefined) {
  if (!value) return mailText("Нет данных", "No data")
  return new Intl.DateTimeFormat(getMailIntlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
