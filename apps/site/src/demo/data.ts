import {
  getMailLocale,
  mailText,
  type MailLocale,
} from "@workspace/mail-design/locale"
import { demoCopy } from "./demo-copy"
import type {
  MailAccountDto,
  MailPreferencesDto,
  MailProfileDto,
  MessageDto,
  UserDto,
} from "../../../web/src/lib/api-client"

export const demoUser: UserDto = {
  id: "demo-user",
  email: "oleg@personal.example",
  role: "owner",
  get displayName() {
    return mailText("Олег", "Oleg")
  },
}
export const folderDefinitions = [
  {
    path: "INBOX",
    get name() {
      return mailText("Входящие", "Inbox")
    },
    specialUse: "\\Inbox",
  },
  {
    path: "Sent",
    get name() {
      return mailText("Отправленные", "Sent")
    },
    specialUse: "\\Sent",
  },
  {
    path: "Trash",
    get name() {
      return mailText("Корзина", "Trash")
    },
    specialUse: "\\Trash",
  },
  {
    path: "Archive",
    get name() {
      return mailText("Архив", "Archive")
    },
    specialUse: "\\Archive",
  },
  {
    path: "Projects",
    get name() {
      return mailText("Проекты", "Projects")
    },
    specialUse: null,
  },
]
export function createDemoData(locale: MailLocale = getMailLocale()) {
  const c = demoCopy[locale]
  const seeds: [string, string, string][] = [
    ["work", "oleg@studio.example", c.accountNames[0]],
    ["personal", "oleg@personal.example", c.accountNames[1]],
    ["projects", "hello@projects.example", c.accountNames[2]],
  ]
  const accounts: MailAccountDto[] = seeds.map(([id, address, label]) => ({
    id: `demo-${id}`,
    address,
    label,
    provider: "custom",
    displayName: c.name,
    connectionStatus: "active",
    syncStatus: "idle",
    lastSyncAt: "2026-11-03T09:00:00.000Z",
    lastError: null,
  }))
  const profiles: MailProfileDto[] = [
    {
      id: "profile-work",
      name: c.profiles[0],
      accountIds: ["demo-work", "demo-projects"],
    },
    {
      id: "profile-personal",
      name: c.profiles[1],
      accountIds: ["demo-personal"],
    },
  ]
  const preferences: MailPreferencesDto = {
    sidebar: {
      order: [
        ...profiles.map(({ id }) => ({ type: "profile" as const, id })),
        ...accounts.map(({ id }) => ({ type: "account" as const, id })),
      ],
    },
    signatures: {
      defaultId: "signature-work",
      defaults: {
        global: { new: "signature-work", reply: null, forward: null },
        accounts: {},
      },
      items: [
        {
          id: "signature-work",
          name: c.signature,
          html: c.signatureHtml,
          updatedAt: "2026-11-03T09:00:00.000Z",
        },
      ],
    },
  }
  const { subjects, senders } = c
  const messages: MessageDto[] = accounts.flatMap((account, accountIndex) =>
    Array.from({ length: 100 }, (_, i) => {
      const folder =
        folderDefinitions[
          i < 65 ? 0 : i < 77 ? 1 : i < 82 ? 2 : i < 91 ? 3 : 4
        ]!
      const id = `${account.id}-message-${i + 1}`
      const subject = `${subjects[(i + accountIndex * 3) % subjects.length]} · ${Math.floor(i / subjects.length) + 1}`
      const text = `${c.greeting}\n\n${subject}.\n${c.paragraph}\n\n${c.disclaimer}\n\n${c.ending}`
      return {
        id,
        accountId: account.id,
        path: folder.path,
        subject,
        from:
          folder.path === "Sent"
            ? { address: account.address, name: c.name }
            : {
                address: `contact${i % 12}@team.example`,
                name: senders[i % senders.length],
              },
        to: [
          {
            address:
              folder.path === "Sent"
                ? `contact${i % 12}@team.example`
                : account.address,
          },
        ],
        sentAt: new Date(
          Date.UTC(2026, 10, 3, 9) - (i * 3 + accountIndex) * 3600000
        ).toISOString(),
        snippet: c.snippet,
        seen: i % 3 !== 0,
        flagged: i % 11 === 0,
        hasAttachments: i % 9 === 0,
        sizeBytes: text.length * 2,
        bodyStatus: "loaded",
        text,
        html: `<p>${c.greeting}</p><h2>${subject}</h2><p>${c.paragraph}</p><p>${c.disclaimer}</p><p>${c.ending}</p>`,
        attachments:
          i % 9 === 0
            ? [
                {
                  id: `${id}-notes`,
                  filename: c.filename,
                  contentType: "text/plain",
                  sizeBytes: 120,
                  contentId: null,
                  isInline: false,
                },
              ]
            : [],
      }
    })
  )
  return { accounts, profiles, preferences, messages }
}
