import { Hono } from "hono"
import { ZodError } from "zod"

import {
  updateMailSidebarOrderRequestSchema,
  updateMailSignatureDefaultsRequestSchema,
  upsertMailSignatureRequestSchema,
} from "../contracts"
import type { MailAgent } from "../mail-agent"
import {
  InvalidSidebarOrderError,
  InvalidSignatureDefaultsError,
} from "../services"
import { requireUser } from "./auth-context"
import { fail, ok } from "./responses"

export function createPreferencesRoutes(agent: MailAgent) {
  const app = new Hono()

  app.get("/mail/preferences", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const preferences = await agent.preferences.getPreferences(auth.user.id)

    return ok(context, {
      preferences,
    })
  })

  app.patch("/mail/preferences/sidebar-order", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = updateMailSidebarOrderRequestSchema.parse(
        await context.req.json()
      )
      const preferences = await agent.preferences.updateSidebarOrder(
        auth.user.id,
        body.order
      )

      return ok(context, {
        preferences,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      if (error instanceof InvalidSidebarOrderError) {
        return fail(
          context,
          422,
          "invalid_sidebar_order",
          "Invalid sidebar order"
        )
      }

      throw error
    }
  })

  app.patch("/mail/preferences/signature", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = upsertMailSignatureRequestSchema.parse(
        await context.req.json()
      )
      const preferences = await agent.preferences.upsertSignature(
        auth.user.id,
        body
      )

      return ok(context, {
        preferences,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      throw error
    }
  })

  app.patch("/mail/preferences/signature-defaults", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = updateMailSignatureDefaultsRequestSchema.parse(
        await context.req.json()
      )
      const preferences = await agent.preferences.updateSignatureDefaults(
        auth.user.id,
        body
      )

      return ok(context, {
        preferences,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      if (error instanceof InvalidSignatureDefaultsError) {
        return fail(
          context,
          422,
          "invalid_signature_defaults",
          "Invalid signature defaults"
        )
      }

      throw error
    }
  })

  return app
}
