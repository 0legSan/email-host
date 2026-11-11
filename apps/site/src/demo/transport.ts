import { mailText } from "@workspace/mail-design/locale"
import type {
  MailAddress,
  MailPreferencesDto,
  MailSidebarOrderItem,
  MessageDto,
  MessagePageRequest,
} from "../../../web/src/lib/api-client"
import { demoUser, folderDefinitions } from "./data"
import {
  bootstrap,
  DemoError,
  demoStore,
  findMessage,
  initialScope,
  listItem,
  mailboxes,
  messagePage,
  updateMessageFlagsBatch,
} from "./store"

type Body = Record<string, unknown>
function record(value: unknown): Body {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new DemoError(
      "DEMO_INVALID_REQUEST",
      mailText("Ожидался JSON объект", "Expected a JSON object")
    )
  return value as Body
}
function string(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}
function required(value: unknown) {
  const result = string(value).trim()
  if (!result)
    throw new DemoError(
      "DEMO_INVALID_REQUEST",
      mailText("Заполни обязательные поля", "Fill in the required fields")
    )
  return result
}
function account(id: string) {
  const result = demoStore.accounts.find((item) => item.id === id)
  if (!result)
    throw new DemoError(
      "DEMO_NOT_FOUND",
      mailText("Демонстрационный ящик не найден", "Demo account not found"),
      404
    )
  return result
}
function pageScope(params: URLSearchParams): MessagePageRequest {
  const scope = {
    ...initialScope,
    specialUse: null,
    cursor: params.get("cursor") ?? undefined,
  }
  for (const key of ["q", "from", "to", "subject", "after", "before"] as const)
    scope[key] = params.get(key) ?? ""
  for (const key of [
    "searchMode",
    "customFolders",
    "hasAttachments",
    "unread",
    "flagged",
  ] as const)
    scope[key] = params.get(key) === "true"
  return {
    ...scope,
    accountId: params.get("accountId"),
    accountIds: params.has("accountIds")
      ? (params.get("accountIds") ?? "").split(",")
      : null,
    path: params.get("path"),
    specialUse: params.get("specialUse"),
  }
}
function preferences() {
  return { preferences: demoStore.preferences }
}
function signatureDefaults(value: unknown) {
  const body = record(value)
  const defaults: Partial<
    MailPreferencesDto["signatures"]["defaults"]["global"]
  > = {}
  for (const mode of ["new", "reply", "forward"] as const) {
    if (body[mode] === null || typeof body[mode] === "string") {
      const id = body[mode]
      if (
        id !== null &&
        !demoStore.preferences.signatures.items.some((item) => item.id === id)
      )
        throw new DemoError(
          "DEMO_NOT_FOUND",
          mailText("Подпись не найдена", "Signature not found"),
          404
        )
      defaults[mode] = id
    }
  }
  return defaults
}
function addresses(value: unknown): MailAddress[] {
  if (!Array.isArray(value)) return []
  // Recipients never leave this tab. Keep only reserved addresses in the mock store.
  return value.map((item, index) => {
    const entry = typeof item === "string" ? { address: item } : record(item)
    const address = string(entry.address)
    return {
      address: /^[^@\s]+@[^@\s]+\.example$/i.test(address)
        ? address
        : `recipient${index + 1}@mail.example`,
      name: string(entry.name) || null,
    }
  })
}
function route(
  method: string,
  path: string,
  params: URLSearchParams,
  body: Body
): unknown {
  if (path === "/api/auth/logout" && method === "POST")
    return { loggedOut: true }
  if (
    (path === "/api/auth/login" && method === "POST") ||
    (path === "/api/auth/me" && method === "GET")
  )
    return { user: demoUser }
  if (path.startsWith("/api/push") || path.startsWith("/api/auth/"))
    throw new DemoError(
      "DEMO_UNAVAILABLE",
      mailText(
        "Эта функция требует настоящего сервера. В демо доступны только локальные почтовые действия.",
        "This feature requires your own server. The demo supports local mail actions only."
      ),
      403
    )
  if (path === "/api/mail/bootstrap" && method === "GET") return bootstrap()
  if (path === "/api/mail/accounts" && method === "GET")
    return { accounts: demoStore.accounts }
  if (path === "/api/mail/accounts/imap" && method === "POST") {
    if (demoStore.accounts.length >= 12)
      throw new DemoError(
        "DEMO_LIMIT",
        mailText(
          "В демо можно создать до 12 ящиков",
          "You can create up to 12 accounts in the demo"
        )
      )
    const id = `demo-${crypto.randomUUID()}`
    const created = {
      ...demoStore.accounts[0]!,
      id,
      address: `mailbox${demoStore.accounts.length + 1}@demo.example`,
      label: mailText("Новый демо-ящик", "New demo account"),
      displayName: string(body.displayName, mailText("Олег", "Oleg")),
    }
    // IMAP/SMTP credentials are deliberately never copied into state.
    demoStore.accounts.push(created)
    return { account: created }
  }
  const accountRoute = path.match(
    /^\/api\/mail\/accounts\/([^/]+)(?:\/(mailboxes|sync-local))?$/
  )
  if (accountRoute) {
    const current = account(accountRoute[1]!)
    if (accountRoute[2] === "mailboxes" && method === "GET")
      return { mailboxes: mailboxes(current.id) }
    if (accountRoute[2] === "sync-local" && method === "POST") {
      current.lastSyncAt = new Date().toISOString()
      return { queued: true }
    }
    if (!accountRoute[2] && method === "PATCH") {
      current.label = string(body.label) || null
      return { account: current }
    }
  }
  if (path === "/api/mail/messages" && method === "GET")
    return messagePage(pageScope(params))
  if (path === "/api/mail/messages/batch" && method === "POST")
    return { messages: strings(body.messageIds).map(findMessage) }
  const messageRoute = path.match(
    /^\/api\/mail\/messages\/([^/]+)(?:\/(thread|move|attachments\/[^/]+))?$/
  )
  if (messageRoute) {
    const message = findMessage(messageRoute[1]!)
    const action = messageRoute[2]
    if (action === "thread" && method === "GET") {
      const folder = folderDefinitions.find(
        (item) => item.path === message.path
      )
      return {
        thread: {
          id: message.id,
          accountId: message.accountId,
          subject: message.subject,
          messageCount: 1,
          messages: [
            {
              ...listItem(message),
              mailboxName: folder?.name ?? null,
              mailboxSpecialUse: folder?.specialUse ?? null,
              isDraft: false,
            },
          ],
        },
      }
    }
    if (action?.startsWith("attachments/") && method === "GET") {
      if (!message.attachments.some((item) => item.id === action.slice(12)))
        throw new DemoError(
          "DEMO_NOT_FOUND",
          mailText("Вложение не найдено", "Attachment not found"),
          404
        )
      return new Response(
        mailText(
          "Локальное демонстрационное вложение. Никакие файлы не загружены с сервера.",
          "This is a local sample attachment. No files were downloaded from a server."
        ),
        { headers: { "content-type": "text/plain; charset=utf-8" } }
      )
    }
    if (action === "move" && method === "POST") {
      const target = required(body.path)
      if (!folderDefinitions.some((item) => item.path === target))
        throw new DemoError(
          "DEMO_NOT_FOUND",
          mailText("Папка не найдена", "Folder not found"),
          404
        )
      message.path = target
      return { message }
    }
    if (!action && method === "PATCH") {
      updateMessageFlagsBatch([
        {
          messagePublicId: message.id,
          ...(typeof body.seen === "boolean" ? { seen: body.seen } : {}),
          ...(typeof body.flagged === "boolean"
            ? { flagged: body.flagged }
            : {}),
        },
      ])
      return { message }
    }
    if (!action && method === "GET") return { message }
  }
  if (path === "/api/mail/contacts" && method === "GET") {
    const contacts = new Map(
      demoStore.messages.flatMap((message) =>
        message.from
          ? [
              [
                message.from.address,
                {
                  ...message.from,
                  name: message.from.name ?? null,
                  lastInteractionAt: message.sentAt,
                },
              ] as const,
            ]
          : []
      )
    )
    return {
      contacts: [...contacts.values()].filter((contact) =>
        `${contact.address} ${contact.name}`
          .toLowerCase()
          .includes((params.get("q") ?? "").toLowerCase())
      ),
    }
  }
  if (path === "/api/mail/account-profiles" && method === "GET")
    return { profiles: demoStore.profiles }
  if (path === "/api/mail/account-profiles" && method === "POST") {
    const profile = {
      id: `profile-${crypto.randomUUID()}`,
      name: required(body.name),
      accountIds: strings(body.accountIds),
    }
    profile.accountIds.forEach(account)
    demoStore.profiles.push(profile)
    demoStore.preferences.sidebar.order.push({
      type: "profile",
      id: profile.id,
    })
    return { profile }
  }
  const profileId = path.match(/^\/api\/mail\/account-profiles\/([^/]+)$/)?.[1]
  if (profileId) {
    const profile = demoStore.profiles.find((item) => item.id === profileId)
    if (!profile)
      throw new DemoError(
        "DEMO_NOT_FOUND",
        mailText("Профиль не найден", "Profile not found"),
        404
      )
    if (method === "PATCH") {
      const ids = strings(body.accountIds)
      ids.forEach(account)
      profile.name = required(body.name)
      profile.accountIds = ids
      return { profile }
    }
    if (method === "DELETE") {
      demoStore.profiles = demoStore.profiles.filter(
        (item) => item.id !== profileId
      )
      demoStore.preferences.sidebar.order =
        demoStore.preferences.sidebar.order.filter(
          (item) => item.id !== profileId
        )
      return { deleted: true }
    }
  }
  if (path === "/api/mail/preferences" && method === "GET") return preferences()
  if (path === "/api/mail/preferences/sidebar-order" && method === "PATCH") {
    if (!Array.isArray(body.order))
      throw new DemoError(
        "DEMO_INVALID_REQUEST",
        mailText("Нужен порядок элементов", "Item order is required")
      )
    demoStore.preferences.sidebar.order = body.order.map(
      (value): MailSidebarOrderItem => {
        const item = record(value)
        if (item.type !== "account" && item.type !== "profile")
          throw new DemoError(
            "DEMO_INVALID_REQUEST",
            mailText("Неизвестный тип элемента", "Unknown item type")
          )
        return { type: item.type, id: required(item.id) }
      }
    )
    return preferences()
  }
  if (path === "/api/mail/preferences/signature" && method === "PATCH") {
    const signatures = demoStore.preferences.signatures
    const id = string(body.id) || `signature-${crypto.randomUUID()}`
    const signature = {
      id,
      name: required(body.name),
      html: string(body.html),
      accountId: string(body.accountId) || null,
      updatedAt: new Date().toISOString(),
    }
    signatures.items = [
      ...signatures.items.filter((item) => item.id !== id),
      signature,
    ]
    if (body.makeDefault === true) {
      signatures.defaultId = id
      signatures.defaults.global = { new: id, reply: id, forward: id }
    }
    if (body.defaultFor) {
      const target = record(body.defaultFor)
      const key = string(target.accountId)
      const defaults = key
        ? (signatures.defaults.accounts[key] ?? {})
        : signatures.defaults.global
      for (const mode of strings(target.modes))
        if (mode === "new" || mode === "reply" || mode === "forward")
          defaults[mode] = id
      if (key) signatures.defaults.accounts[key] = defaults
    }
    return preferences()
  }
  if (
    path === "/api/mail/preferences/signature-defaults" &&
    method === "PATCH"
  ) {
    const defaults = signatureDefaults(body.defaults)
    const key = string(body.accountId)
    const signatures = demoStore.preferences.signatures
    if (key) {
      account(key)
      signatures.defaults.accounts[key] = {
        ...signatures.defaults.accounts[key],
        ...defaults,
      }
    } else {
      Object.assign(signatures.defaults.global, defaults)
      signatures.defaultId = signatures.defaults.global.new
    }
    return preferences()
  }
  if (path === "/api/mail/send" && method === "POST") {
    if (Array.isArray(body.attachments) && body.attachments.length > 0) {
      throw new DemoError(
        "DEMO_ATTACHMENTS_UNAVAILABLE",
        mailText(
          "Демо отправляет только локальный текст и HTML. Удали вложения, чтобы имитировать отправку. Примеры текстовых вложений доступны во входящих письмах.",
          "The demo sends local text and HTML only. Remove attachments to simulate sending. Sample text attachments are available in the inbox."
        )
      )
    }
    if (demoStore.messages.length >= 1000)
      throw new DemoError(
        "DEMO_LIMIT",
        mailText(
          "Лимит писем демо исчерпан. Перезагрузи страницу.",
          "The demo message limit has been reached. Reload the page."
        )
      )
    const sender = account(required(body.accountId))
    const to = addresses(body.to)
    if (!to.length)
      throw new DemoError(
        "DEMO_INVALID_REQUEST",
        mailText("Нужен хотя бы один получатель", "Add at least one recipient")
      )
    const message: MessageDto = {
      id: `sent-${crypto.randomUUID()}`,
      accountId: sender.id,
      path: "Sent",
      subject: string(body.subject),
      from: { address: sender.address, name: sender.displayName },
      to,
      sentAt: new Date().toISOString(),
      snippet: string(body.text).slice(0, 160),
      seen: true,
      flagged: false,
      hasAttachments: false,
      sizeBytes: string(body.text).length * 2,
      bodyStatus: "loaded",
      text: string(body.text),
      html: string(body.html),
      attachments: [],
    }
    demoStore.messages.unshift(message)
    return {
      outboundMessage: {
        id: message.id,
        status: "simulated",
        messageId: message.id,
      },
    }
  }
  throw new DemoError(
    "DEMO_UNKNOWN_ENDPOINT",
    mailText(
      `Локальное демо не поддерживает ${method} ${path}`,
      `The local demo does not support ${method} ${path}`
    ),
    404
  )
}

export async function mailApiFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const request = input instanceof Request ? input : null
  const signal = init?.signal ?? request?.signal
  if (signal?.aborted) throw new DOMException("Request aborted", "AbortError")
  try {
    const url = new URL(request?.url ?? String(input), "https://demo.example")
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase()
    const raw =
      init?.body !== undefined
        ? await new Response(init.body).text()
        : request
          ? await request.clone().text()
          : ""
    let body: Body = {}
    if (raw) {
      try {
        body = record(JSON.parse(raw))
      } catch {
        throw new DemoError(
          "DEMO_INVALID_REQUEST",
          mailText("Некорректный JSON", "Invalid JSON")
        )
      }
    }
    const data = route(method, decodeURI(url.pathname), url.searchParams, body)
    return data instanceof Response ? data : Response.json({ ok: true, data })
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: {
          code: error instanceof DemoError ? error.code : "DEMO_ERROR",
          message:
            error instanceof Error
              ? error.message
              : mailText("Ошибка локального демо", "Local demo error"),
        },
      },
      { status: error instanceof DemoError ? error.status : 500 }
    )
  }
}
