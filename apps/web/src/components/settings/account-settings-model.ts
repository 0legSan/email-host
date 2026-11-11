import { type UiMessage, UiMessageError } from "../ui-message"
import { mailText, getMailIntlLocale } from "@workspace/mail-design/locale"
import {
  apiFetch,
  type ConnectImapAccountRequest,
  type ImapProvider,
  type MailAccountDto,
  type MailConnectionSettings,
  type MailProfileDto,
  type RequestError,
} from "@/lib/api-client"

export type AccountFormState = {
  provider: ImapProvider
  address: string
  displayName: string
  imapHost: string
  imapPort: string
  imapSecure: boolean
  imapUsername: string
  imapPassword: string
  smtpHost: string
  smtpPort: string
  smtpSecure: boolean
  smtpUsername: string
  smtpPassword: string
}

export type PresetProvider = Exclude<ImapProvider, "custom">

export type ProviderGuide = {
  title: string
  steps: string[]
  note?: string
  links: {
    href: string
    label: string
  }[]
}

export function getProviderOptions() {
  return [
    { value: "gmail", label: "Gmail" },
    { value: "yandex", label: "Yandex" },
    { value: "mailru", label: "Mail.ru" },
    { value: "rambler", label: "Rambler" },
    { value: "beget", label: "Beget" },
    { value: "custom", label: mailText("Другой IMAP", "Custom IMAP") },
  ] satisfies { value: ImapProvider; label: string }[]
}

export const imapProviderPresets: Record<
  PresetProvider,
  {
    imap: Omit<MailConnectionSettings, "username" | "password">
    smtp: Omit<MailConnectionSettings, "username" | "password">
  }
> = {
  gmail: {
    imap: {
      host: "imap.gmail.com",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
    },
  },
  yandex: {
    imap: {
      host: "imap.yandex.ru",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.yandex.ru",
      port: 465,
      secure: true,
    },
  },
  mailru: {
    imap: {
      host: "imap.mail.ru",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.mail.ru",
      port: 465,
      secure: true,
    },
  },
  rambler: {
    imap: {
      host: "imap.rambler.ru",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.rambler.ru",
      port: 465,
      secure: true,
    },
  },
  beget: {
    imap: {
      host: "imap.beget.com",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.beget.com",
      port: 465,
      secure: true,
    },
  },
}

export function getProviderGuides(): Record<PresetProvider, ProviderGuide> {
  return {
    gmail: {
      title: "Gmail",
      steps: [
        mailText(
          "Включи двухэтапную проверку в Google Account.",
          "Enable two-step verification in your Google Account."
        ),
        mailText(
          "Создай app password для почтового приложения.",
          "Create an app password for your email client."
        ),
        mailText(
          "Вставь 16-символьный пароль в оба поля Password.",
          "Paste the 16-character password into both Password fields."
        ),
      ],
      note: mailText(
        "Если пароль Google менялся, app passwords могут быть отозваны.",
        "Changing your Google password may revoke app passwords."
      ),
      links: [
        {
          href: "https://myaccount.google.com/apppasswords",
          label: mailText("Получить app password", "Get app password"),
        },
        {
          href: "https://support.google.com/accounts/answer/185833",
          label: mailText("Инструкция Google", "Google instructions"),
        },
      ],
    },
    yandex: {
      title: mailText("Яндекс", "Yandex"),
      steps: [
        mailText(
          "Открой Яндекс ID и создай пароль приложения типа Почта.",
          "Open Yandex ID and create an app password for Mail."
        ),
        mailText(
          "В настройках Яндекс Почты включи IMAP и Пароли приложений/OAuth-токены.",
          "In Yandex Mail settings, enable IMAP and App passwords/OAuth tokens."
        ),
        mailText(
          "Вставь созданный пароль в оба поля Password.",
          "Paste the generated password into both Password fields."
        ),
      ],
      links: [
        {
          href: "https://id.yandex.ru/security/app-passwords",
          label: mailText("Получить пароль приложения", "Get app password"),
        },
        {
          href: "https://yandex.ru/support/id/ru/authorization/app-passwords",
          label: mailText("Инструкция Яндекса", "Yandex instructions"),
        },
      ],
    },
    mailru: {
      title: "Mail.ru",
      steps: [
        mailText(
          "Создай пароль для внешнего приложения в настройках безопасности Mail.",
          "Create a password for an external app in Mail security settings."
        ),
        mailText(
          "Проверь, что доступ по IMAP, POP и SMTP включен.",
          "Check that IMAP, POP and SMTP access is enabled."
        ),
        mailText(
          "Вставь созданный пароль в оба поля Password.",
          "Paste the generated password into both Password fields."
        ),
      ],
      links: [
        {
          href: "https://account.mail.ru/user/2-step-auth/passwords/",
          label: mailText("Получить пароль", "Get password"),
        },
        {
          href: "https://help.mail.ru/mail/login/mailer/",
          label: mailText("Инструкция Mail.ru", "Mail.ru instructions"),
        },
      ],
    },
    rambler: {
      title: "Rambler",
      steps: [
        mailText(
          "В Рамблер/почте включи доступ для почтовых клиентов в разделе Программы.",
          "In Rambler Mail, enable email client access in Programs."
        ),
        mailText(
          "Если включена 2FA, создай специальный пароль для почтовых протоколов.",
          "If 2FA is enabled, create a dedicated password for email protocols."
        ),
        mailText(
          "Вставь этот пароль в оба поля Password.",
          "Paste this password into both Password fields."
        ),
      ],
      links: [
        {
          href: "https://id.rambler.ru/",
          label: mailText("Открыть профиль Rambler", "Open Rambler profile"),
        },
        {
          href: "https://help.rambler.ru/mail/mail-pochtovye-klienty/2390",
          label: mailText("Инструкция Rambler", "Rambler instructions"),
        },
      ],
    },
    beget: {
      title: "Beget",
      steps: [
        mailText(
          "Используй пароль конкретного почтового ящика из панели Beget.",
          "Use the password for this email account from the Beget control panel."
        ),
        mailText(
          "Не вставляй пароль от аккаунта хостинга, если он отличается от пароля ящика.",
          "Do not use your hosting account password if it differs from the email account password."
        ),
        mailText(
          "Вставь пароль ящика в оба поля Password.",
          "Paste the email account password into both Password fields."
        ),
      ],
      links: [
        {
          href: "https://cp.beget.com/",
          label: mailText("Открыть панель Beget", "Open Beget panel"),
        },
        {
          href: "https://beget.com/ru/kb/how-to/mail/obshhie-svedeniya",
          label: mailText("Настройки Beget", "Beget settings"),
        },
      ],
    },
  }
}

export const settingsInputClassName =
  "h-10 w-full border border-[#cfd6dd] bg-[#fbfcfd] px-3 text-sm font-normal outline-none transition focus:border-[#151719] dark:border-[#30353a] dark:bg-[#101214] dark:focus:border-[#f6f3ef]"

export const settingsSelectTriggerClassName = `${settingsInputClassName} !h-10 justify-between`

export function getAccountLabel(account: MailAccountDto) {
  return account.label?.trim() || account.address
}

export async function connectImapAccount(request: ConnectImapAccountRequest) {
  return apiFetch<{ account: MailAccountDto }>("/api/mail/accounts/imap", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  })
}

export async function updateMailAccountName(accountId: string, label: string) {
  return apiFetch<{ account: MailAccountDto }>(
    "/api/mail/accounts/" + accountId,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        label,
      }),
    }
  )
}

export async function createMailProfile(request: {
  name: string
  accountIds: string[]
}) {
  return apiFetch<{ profile: MailProfileDto }>("/api/mail/account-profiles", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  })
}

export async function updateMailProfile(
  profileId: string,
  request: {
    name: string
    accountIds: string[]
  }
) {
  return apiFetch<{ profile: MailProfileDto }>(
    "/api/mail/account-profiles/" + profileId,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    }
  )
}

export async function deleteMailProfile(profileId: string) {
  return apiFetch<{ deleted: boolean }>(
    "/api/mail/account-profiles/" + profileId,
    {
      method: "DELETE",
    }
  )
}

export function createEmptyAccountForm(
  provider: ImapProvider = "yandex"
): AccountFormState {
  return applyProviderPreset({
    provider,
    address: "",
    displayName: "",
    imapHost: "",
    imapPort: "",
    imapSecure: true,
    imapUsername: "",
    imapPassword: "",
    smtpHost: "",
    smtpPort: "",
    smtpSecure: true,
    smtpUsername: "",
    smtpPassword: "",
  })
}

export function applyProviderPreset(form: AccountFormState): AccountFormState {
  if (form.provider === "custom") {
    return form
  }

  const preset = imapProviderPresets[form.provider]

  return {
    ...form,
    imapHost: preset.imap.host,
    imapPort: String(preset.imap.port),
    imapSecure: preset.imap.secure,
    smtpHost: preset.smtp.host,
    smtpPort: String(preset.smtp.port),
    smtpSecure: preset.smtp.secure,
  }
}

export function prefixPatch(
  prefix: "imap" | "smtp",
  patch: Partial<{
    host: string
    password: string
    port: string
    secure: boolean
    username: string
  }>
): Partial<AccountFormState> {
  const nextPatch: Partial<AccountFormState> = {}

  if (prefix === "imap") {
    if (patch.host !== undefined) {
      nextPatch.imapHost = patch.host
    }
    if (patch.password !== undefined) {
      nextPatch.imapPassword = patch.password
    }
    if (patch.port !== undefined) {
      nextPatch.imapPort = patch.port
    }
    if (patch.secure !== undefined) {
      nextPatch.imapSecure = patch.secure
    }
    if (patch.username !== undefined) {
      nextPatch.imapUsername = patch.username
    }

    return nextPatch
  }

  if (patch.host !== undefined) {
    nextPatch.smtpHost = patch.host
  }
  if (patch.password !== undefined) {
    nextPatch.smtpPassword = patch.password
  }
  if (patch.port !== undefined) {
    nextPatch.smtpPort = patch.port
  }
  if (patch.secure !== undefined) {
    nextPatch.smtpSecure = patch.secure
  }
  if (patch.username !== undefined) {
    nextPatch.smtpUsername = patch.username
  }

  return nextPatch
}

export function buildConnectImapAccountRequest(
  form: AccountFormState
): ConnectImapAccountRequest {
  const address = form.address.trim().toLowerCase()
  const imapPort = parsePort(form.imapPort, "IMAP")
  const smtpPort = parsePort(form.smtpPort, "SMTP")

  if (!address) {
    throw new UiMessageError("Укажи email", "Enter an email address")
  }

  return {
    provider: form.provider,
    address,
    displayName: form.displayName.trim() || undefined,
    imap: {
      host: form.imapHost.trim(),
      port: imapPort,
      secure: form.imapSecure,
      username: form.imapUsername.trim() || address,
      password: form.imapPassword,
    },
    smtp: {
      host: form.smtpHost.trim(),
      port: smtpPort,
      secure: form.smtpSecure,
      username: form.smtpUsername.trim() || address,
      password: form.smtpPassword,
    },
  }
}

export function parsePort(value: string, label: string) {
  const port = Number(value)

  if (!Number.isInteger(port) || port <= 0) {
    throw new UiMessageError(
      `Порт ${label}: нужно целое число больше 0`,
      `${label} port: enter a whole number greater than 0`
    )
  }

  return port
}

export function toggleSetValue<T>(values: Set<T>, value: T) {
  const nextValues = new Set(values)

  if (nextValues.has(value)) {
    nextValues.delete(value)
  } else {
    nextValues.add(value)
  }

  return nextValues
}

export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) {
    return false
  }

  for (const value of a) {
    if (!b.has(value)) {
      return false
    }
  }

  return true
}

export function pluralizeAccounts(count: number): string {
  const mod10 = count % 10
  const mod100 = count % 100

  if (mod10 === 1 && mod100 !== 11) {
    return mailText("ящик", "account")
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return mailText("ящика", "accounts")
  }

  return mailText("ящиков", "accounts")
}

export function getAccountConnectionErrorMessage(error: unknown): UiMessage {
  if (error instanceof UiMessageError) return error.variants
  const requestError = error instanceof Error ? (error as RequestError) : null

  if (requestError?.code === "imap_greeting_timeout") {
    return [
      "IMAP-сервер не ответил вовремя. Повтори попытку через несколько минут.",
      "The IMAP server did not respond in time. Try again in a few minutes.",
    ]
  }

  if (requestError?.code === "invalid_provider_credentials") {
    return [
      "Не удалось войти в почтовый ящик. Проверь логин и пароль.",
      "Could not sign in to the email account. Check your username and password.",
    ]
  }

  if (requestError && (requestError.status ?? 0) >= 500) {
    return [
      "Почтовый сервер временно недоступен. Попробуй подключить ящик позже.",
      "The mail server is temporarily unavailable. Try connecting the account later.",
    ]
  }

  return [
    "Не удалось подключить ящик. Проверь настройки и попробуй ещё раз.",
    "Could not connect the account. Check the settings and try again.",
  ]
}

export function getErrorMessage(error: unknown): UiMessage {
  if (error instanceof UiMessageError) return error.variants
  return error instanceof Error
    ? error.message
    : ["Неизвестная ошибка", "Unknown error"]
}

export function getAccountInitials(account: MailAccountDto) {
  const value = account.label ?? account.address
  const letter = value.trim().charAt(0)

  return letter ? letter.toUpperCase() : "M"
}

export function formatAccountStatus(account: MailAccountDto) {
  if (
    account.syncStatus === "initial_sync" ||
    account.syncStatus === "incremental_sync"
  ) {
    return mailText("Обновление писем…", "Updating messages…")
  }

  if (
    account.connectionStatus === "auth_error" ||
    (account.connectionStatus === "connect_error" &&
      account.syncStatus === "paused")
  ) {
    return mailText(
      "Требуется переподключение через форму слева",
      "Reconnect using the form on the left"
    )
  }

  if (account.lastSyncAt) {
    return (
      mailText("Обновлён ", "Updated ") +
      new Intl.DateTimeFormat(getMailIntlLocale(), {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
      }).format(new Date(account.lastSyncAt))
    )
  }

  if (account.connectionStatus === "pending") {
    return mailText("Подключение…", "Connecting…")
  }

  if (account.connectionStatus === "disconnecting") {
    return mailText("Отключение…", "Disconnecting…")
  }

  if (account.connectionStatus === "disconnected") {
    return mailText("Отключён", "Disconnected")
  }

  return mailText("Подключён", "Connected")
}
