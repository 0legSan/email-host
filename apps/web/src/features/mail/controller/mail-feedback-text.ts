import { localizeRequestErrorText } from "@/lib/request-error-text"
import { mailText } from "@workspace/mail-design/locale"

// Feedback stays in existing controller state. Resolve known client messages at render
// so switching language does not reset the action, its status, or a draft.
const feedbackText: ReadonlyArray<readonly [string, string]> = [
  [
    "Целевая папка не найдена для этого аккаунта",
    "Destination folder not found for this account",
  ],
  [
    "Не найден аккаунт для выбранного письма",
    "Account not found for the selected message",
  ],
  [
    "Целевая папка не найдена для выбранного письма",
    "Destination folder not found for the selected message",
  ],
  [
    "Целевая папка не найдена для выбранных писем",
    "Destination folder not found for the selected messages",
  ],
  [
    "Переподключите почтовый ящик в настройках",
    "Reconnect your mailbox in settings",
  ],
  [
    "Почтовый сервер временно недоступен. Попробуйте ещё раз позже",
    "Mail server is temporarily unavailable. Try again later",
  ],
  ["Неизвестная ошибка", "Unknown error"],
  [
    "Нет подключения и локальный кеш недоступен",
    "No connection and the local cache is unavailable",
  ],
  [
    "Содержимое письма не сохранено на устройстве. Загрузите его после подключения к серверу.",
    "Message content is not saved on this device. Load it after reconnecting to the server.",
  ],
  ["Не удалось загрузить содержимое письма", "Could not load message content"],
  ["Отправляю проверочный push", "Sending test push"],
  [
    "Уведомления включены. Проверочный push отправлен.",
    "Notifications enabled. Test push sent.",
  ],
  ["Уведомления включены.", "Notifications enabled."],
  // The PWA package reports plain strings. Localize them at the mail UI boundary.
  [
    "Service worker не готов для push-уведомлений",
    "Service worker is not ready for push notifications",
  ],
  [
    "Push-уведомления не поддерживаются этим браузером",
    "This browser does not support push notifications",
  ],
  [
    "Не удалось проверить текущую push-подписку",
    "Could not check the current push subscription",
  ],
  ["Получаю push-ключ сервера", "Getting the server push key"],
  [
    "Сервер не ответил на запрос push-ключа",
    "Server did not respond to the push key request",
  ],
  ["Жду service worker", "Waiting for service worker"],
  ["Проверяю push-подписку браузера", "Checking the browser push subscription"],
  [
    "Браузер не создал push-подписку",
    "Browser did not create a push subscription",
  ],
  [
    "Сохраняю push-подписку на сервере",
    "Saving the push subscription on the server",
  ],
  [
    "Сервер не сохранил push-подписку",
    "Server did not save the push subscription",
  ],
  [
    "Уведомления заблокированы в настройках браузера",
    "Notifications are blocked in browser settings",
  ],
  ["Запрашиваю разрешение браузера", "Requesting browser permission"],
  [
    "Браузер не завершил запрос разрешения на уведомления",
    "Browser did not complete the notification permission request",
  ],
  [
    "Браузер не выдал разрешение на уведомления",
    "Browser did not grant notification permission",
  ],
  [
    "Сервер не ответил на проверочный push",
    "Server did not respond to the test push",
  ],
]

export function localizeMailFeedback(value: string | null) {
  if (!value) return value
  const normalized = value.replace(/\s+/g, " ")
  const pair = feedbackText.find(
    ([ru, en]) => normalized === ru || normalized === en
  )
  return pair ? mailText(pair[0], pair[1]) : localizeRequestErrorText(value)
}
