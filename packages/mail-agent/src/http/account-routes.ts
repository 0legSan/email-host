import { Hono } from "hono"
import { ZodError } from "zod"

import {
  connectImapAccountRequestSchema,
  createMailAccountProfileRequestSchema,
  publicIdSchema,
  reconnectImapAccountRequestSchema,
  updateMailAccountRequestSchema,
  updateMailAccountProfileRequestSchema,
} from "../contracts"
import type { MailAgent } from "../mail-agent"
import { InvalidProfileAccountsError } from "../services"
import { MailEngineError } from "../mail-engine"
import { fail, ok } from "./responses"
import { requireUser } from "./auth-context"

export function createAccountRoutes(agent: MailAgent) {
  const app = new Hono()

  app.get("/mail/accounts", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const accounts = await agent.accounts.listAccounts(auth.user.id)

    return ok(context, {
      accounts,
    })
  })

  app.get("/mail/account-profiles", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const profiles = await agent.accountProfiles.listProfiles(auth.user.id)

    return ok(context, {
      profiles,
    })
  })

  app.post("/mail/account-profiles", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = createMailAccountProfileRequestSchema.parse(
        await context.req.json()
      )
      const profile = await agent.accountProfiles.createProfile(
        auth.user.id,
        body
      )

      return ok(context, {
        profile,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      if (error instanceof InvalidProfileAccountsError) {
        return fail(context, 422, "invalid_accounts", "Invalid accounts")
      }

      throw error
    }
  })

  app.patch("/mail/account-profiles/:profileId", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const profileId = publicIdSchema.safeParse(context.req.param("profileId"))

    if (!profileId.success) {
      return fail(context, 404, "profile_not_found", "Profile not found")
    }

    try {
      const body = updateMailAccountProfileRequestSchema.parse(
        await context.req.json()
      )
      const profile = await agent.accountProfiles.updateProfile(
        auth.user.id,
        profileId.data,
        body
      )

      if (!profile) {
        return fail(context, 404, "profile_not_found", "Profile not found")
      }

      return ok(context, {
        profile,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      if (error instanceof InvalidProfileAccountsError) {
        return fail(context, 422, "invalid_accounts", "Invalid accounts")
      }

      throw error
    }
  })

  app.delete("/mail/account-profiles/:profileId", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const profileId = publicIdSchema.safeParse(context.req.param("profileId"))

    if (!profileId.success) {
      return fail(context, 404, "profile_not_found", "Profile not found")
    }

    const deleted = await agent.accountProfiles.deleteProfile(
      auth.user.id,
      profileId.data
    )

    if (!deleted) {
      return fail(context, 404, "profile_not_found", "Profile not found")
    }

    return ok(context, {
      deleted: true,
    })
  })

  app.post("/mail/accounts/imap", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = connectImapAccountRequestSchema.parse(
        await context.req.json()
      )
      const account = await agent.accounts.connectImapAccount(
        auth.user.id,
        body
      )

      return ok(context, {
        account,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      if (error instanceof MailEngineError) {
        return failMailEngineError(context, error)
      }

      throw error
    }
  })

  app.get("/mail/accounts/oauth/:provider/start", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    return fail(context, 410, "oauth_disabled", "OAuth connection is disabled")
  })

  app.get("/mail/accounts/oauth/:provider/callback", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    return fail(context, 410, "oauth_disabled", "OAuth connection is disabled")
  })

  app.post("/mail/accounts/:accountId/reconnect", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = reconnectImapAccountRequestSchema.parse(
        await context.req.json()
      )
      const account = await agent.accounts.reconnect(
        auth.user.id,
        context.req.param("accountId"),
        body
      )

      if (!account) {
        return fail(context, 404, "account_not_found", "Account not found")
      }

      return ok(context, {
        account,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      if (error instanceof MailEngineError) {
        return failMailEngineError(context, error)
      }

      throw error
    }
  })

  app.post("/mail/accounts/:accountId/sync", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const account = await agent.accounts.requestSync(
      auth.user.id,
      context.req.param("accountId")
    )

    if (!account) {
      return fail(context, 404, "account_not_found", "Account not found")
    }

    return ok(context, {
      account,
    })
  })

  app.patch("/mail/accounts/:accountId", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = updateMailAccountRequestSchema.parse(
        await context.req.json()
      )
      const account = await agent.accounts.updateAccount(
        auth.user.id,
        context.req.param("accountId"),
        body
      )

      if (!account) {
        return fail(context, 404, "account_not_found", "Account not found")
      }

      return ok(context, {
        account,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      throw error
    }
  })

  app.delete("/mail/accounts/:accountId", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const deleted = await agent.accounts.deleteAccount(
      auth.user.id,
      context.req.param("accountId")
    )

    if (!deleted) {
      return fail(context, 404, "account_not_found", "Account not found")
    }

    return ok(context, {
      deleted: true,
    })
  })

  return app
}

function failMailEngineError(
  context: Parameters<typeof fail>[0],
  error: MailEngineError
) {
  console.warn("Mail account connection failed", formatMailEngineError(error))

  if (hasCauseCode(error, "GREETING_TIMEOUT")) {
    return fail(context, 503, "imap_greeting_timeout", error.message)
  }

  if (error.code === "auth_error") {
    return fail(context, 401, "invalid_provider_credentials", error.message)
  }

  return fail(context, 503, error.code, error.message)
}

function formatMailEngineError(error: MailEngineError) {
  const cause = readErrorCause(error)

  return {
    code: error.code,
    message: error.message,
    cause:
      cause instanceof Error
        ? {
            code: readStringProperty(cause, "code"),
            command: readStringProperty(cause, "command"),
            message: cause.message,
            name: cause.name,
            response: readStringProperty(cause, "response"),
            responseCode: readNumberProperty(cause, "responseCode"),
            responseStatus: readStringProperty(cause, "responseStatus"),
            serverResponseCode: readStringProperty(cause, "serverResponseCode"),
          }
        : null,
  }
}

function readErrorCause(error: Error) {
  return (error as Error & { cause?: unknown }).cause
}

function hasCauseCode(error: Error, code: string) {
  const cause = readErrorCause(error)

  return cause instanceof Error && readStringProperty(cause, "code") === code
}

function readStringProperty(error: Error, property: string) {
  const value = (error as Error & Record<string, unknown>)[property]

  return typeof value === "string" ? value : undefined
}

function readNumberProperty(error: Error, property: string) {
  const value = (error as Error & Record<string, unknown>)[property]

  return typeof value === "number" ? value : undefined
}
