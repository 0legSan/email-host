import { Hono } from "hono"

import type { LiveMailboxDto } from "../contracts"
import type { MailAgent } from "../mail-agent"
import { toUserDto } from "../services/auth-service"
import { requireUser } from "./auth-context"
import { ok } from "./responses"

const bootstrapMessageScope = {
  accountId: null,
  accountIds: null,
  searchMode: false,
  path: null,
  specialUse: "\\Inbox",
  customFolders: false,
  q: "",
  from: "",
  to: "",
  subject: "",
  after: "",
  before: "",
  hasAttachments: false,
  unread: false,
  flagged: false,
} as const
const bootstrapMessagePageSize = 200

export function createBootstrapRoutes(agent: MailAgent) {
  const app = new Hono()

  app.get("/mail/bootstrap", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const [accounts, profiles, preferences] = await Promise.all([
      agent.accounts.listAccounts(auth.user.id),
      agent.accountProfiles.listProfiles(auth.user.id),
      agent.preferences.getPreferences(auth.user.id),
    ])
    const [mailboxEntries, initialMessages] = await Promise.all([
      Promise.all(
        accounts.map(async (account) => {
          let mailboxes: LiveMailboxDto[] = []

          try {
            mailboxes =
              (await agent.mail.listMailboxes(auth.user.id, account.id)) ?? []
          } catch (error) {
            console.error("Mail bootstrap mailbox load failed", {
              accountId: account.id,
              message: getErrorMessage(error),
            })
          }

          return [account.id, mailboxes] as const
        })
      ),
      agent.mail
        .listStoredMessages(auth.user.id, {
          specialUse: bootstrapMessageScope.specialUse,
          pageSize: bootstrapMessagePageSize,
        })
        .catch((error) => {
          console.error("Mail bootstrap message load failed", {
            message: getErrorMessage(error),
          })

          return {
            total: null,
            nextPageCursor: null,
            messages: [],
          }
        }),
    ])

    return ok(context, {
      user: toUserDto(auth.user),
      accounts,
      preferences,
      profiles,
      mailboxesByAccount: Object.fromEntries(mailboxEntries),
      initialMessages: {
        scope: bootstrapMessageScope,
        page: initialMessages,
      },
    })
  })

  return app
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
