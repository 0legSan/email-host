import { mailText } from "@workspace/mail-design/locale"

const messages: Record<string, readonly [string, string]> = {
  DEMO_ATTACHMENTS_UNAVAILABLE: [
    "Демо отправляет только локальный текст и HTML. Удали вложения, чтобы имитировать отправку. Примеры текстовых вложений доступны во входящих письмах.",
    "The demo sends local text and HTML only. Remove attachments to simulate sending. Sample text attachments are available in the inbox.",
  ],
  DEMO_UNAVAILABLE: [
    "Эта возможность доступна на своём сервере. В демо работают только локальные действия с почтой.",
    "This feature requires your own server. The demo supports local mail actions only.",
  ],
  account_not_found: ["Ящик не найден.", "Mail account not found."],
  attachment_not_found: ["Вложение не найдено.", "Attachment not found."],
  client_request_conflict: [
    "Запрос уже обрабатывается. Повторите позже.",
    "This request is already being processed. Try again later.",
  ],
  email_already_registered: [
    "Этот адрес уже зарегистрирован.",
    "This email address is already registered.",
  ],
  forbidden: [
    "Недостаточно прав для этого действия.",
    "You do not have permission to do this.",
  ],
  imap_greeting_timeout: [
    "Почтовый сервер не ответил вовремя. Проверьте адрес и порт.",
    "The mail server did not respond in time. Check its address and port.",
  ],
  invalid_accounts: [
    "Проверьте выбранные почтовые ящики.",
    "Check the selected mail accounts.",
  ],
  invalid_credentials: [
    "Неверный адрес или пароль.",
    "The email address or password is incorrect.",
  ],
  invalid_provider_credentials: [
    "Провайдер отклонил данные для входа. Проверьте логин и пароль приложения.",
    "Your provider rejected the credentials. Check your login and app password.",
  ],
  invalid_request: [
    "Проверьте поля формы и повторите действие.",
    "Check the form fields and try again.",
  ],
  invalid_sidebar_order: [
    "Не удалось сохранить порядок ящиков.",
    "Could not save the account order.",
  ],
  invalid_signature_defaults: [
    "Проверьте подписи для выбранных ящиков.",
    "Check the signatures for the selected accounts.",
  ],
  invite_not_found: [
    "Приглашение недействительно или срок его действия истёк.",
    "This invitation is invalid or has expired.",
  ],
  link_not_found: [
    "Ссылка не найдена или срок её действия истёк.",
    "This link was not found or has expired.",
  ],
  mail_provider_unavailable: [
    "Почтовый провайдер недоступен. Повторите позже.",
    "Your mail provider is unavailable. Try again later.",
  ],
  message_not_found: ["Письмо не найдено.", "Email not found."],
  oauth_disabled: [
    "Подключение через OAuth отключено. Используйте IMAP и SMTP.",
    "OAuth connections are disabled. Use IMAP and SMTP.",
  ],
  profile_not_found: ["Профиль не найден.", "Profile not found."],
  push_not_configured: [
    "Push-уведомления не настроены на сервере.",
    "Push notifications are not configured on the server.",
  ],
  push_subscription_missing: [
    "Подписка на уведомления не найдена. Включите уведомления снова.",
    "Notification subscription not found. Enable notifications again.",
  ],
  reset_link_not_found: [
    "Ссылка восстановления недействительна или срок её действия истёк.",
    "This password reset link is invalid or has expired.",
  ],
  send_failed: [
    "Не удалось отправить письмо. Проверьте подключение SMTP и повторите.",
    "Could not send your email. Check the SMTP connection and try again.",
  ],
  unauthorized: ["Войдите в приложение снова.", "Sign in again."],
  user_deactivated: [
    "Учётная запись отключена. Обратитесь к владельцу сервера.",
    "This user account is deactivated. Contact the server owner.",
  ],
  user_not_found: ["Пользователь не найден.", "User not found."],
}

export function requestErrorText(code: string, serverMessage: string) {
  const text = messages[code]
  // Provider diagnostics and demo messages retain their original detail.
  return text ? mailText(text[0], text[1]) : serverMessage
}

// Only messages produced by this client are translated. Unknown provider
// diagnostics remain intact, including their original language and detail.
export function localizeRequestErrorText(value: string) {
  const normalized = value.replace(/\s+/g, " ")
  const pairs = [
    ...Object.values(messages),
    [
      "Время ожидания запроса истекло. Повторите действие.",
      "The request timed out. Try again.",
    ],
  ]
  const pair = pairs.find(
    ([ru, en]) => normalized === ru.replace(/\s+/g, " ") || normalized === en
  )
  if (pair) return mailText(pair[0], pair[1])
  const unexpected = normalized.match(
    /^(?:Сервер вернул неожиданный ответ\. Код |The server returned an unexpected response\. Status )(\d{3})\.$/
  )
  if (unexpected)
    return mailText(
      `Сервер вернул неожиданный ответ. Код ${unexpected[1]}.`,
      `The server returned an unexpected response. Status ${unexpected[1]}.`
    )
  const status = normalized.match(
    /^(?:Запрос завершился с ошибкой |Request failed with status )(\d{3})$/
  )
  return status
    ? mailText(
        `Запрос завершился с ошибкой ${status[1]}`,
        `Request failed with status ${status[1]}`
      )
    : value
}
