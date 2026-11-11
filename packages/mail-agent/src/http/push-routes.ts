import { Hono } from "hono"
import { ZodError } from "zod"

import {
  deletePushSubscriptionRequestSchema,
  savePushSubscriptionRequestSchema,
} from "../contracts"
import type { MailAgent } from "../mail-agent"
import { requireUser } from "./auth-context"
import { fail, ok } from "./responses"

export function createPushRoutes(agent: MailAgent) {
  const app = new Hono()

  app.get("/push/vapid-public-key", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const publicKey = agent.pushNotifications.getPublicKey()

    if (!publicKey) {
      return fail(
        context,
        503,
        "push_not_configured",
        "Push-уведомления не настроены на сервере"
      )
    }

    return ok(context, {
      publicKey,
    })
  })

  app.get("/push/badge", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    return ok(context, {
      unreadCount: await agent.pushNotifications.getUnreadCount(auth.user.id),
    })
  })

  app.post("/push/subscriptions", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      if (!agent.pushNotifications.isConfigured()) {
        return fail(
          context,
          503,
          "push_not_configured",
          "Push-уведомления не настроены на сервере"
        )
      }

      const body = savePushSubscriptionRequestSchema.parse(
        await context.req.json()
      )

      await agent.pushNotifications.saveSubscription(
        auth.user.id,
        body.subscription,
        context.req.header("user-agent")
      )

      return ok(context, {
        subscribed: true,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      throw error
    }
  })

  app.post("/push/test", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    if (!agent.pushNotifications.isConfigured()) {
      return fail(
        context,
        503,
        "push_not_configured",
        "Push-уведомления не настроены на сервере"
      )
    }

    const sent = await agent.pushNotifications.notifyTest(auth.user.id)

    if (sent === 0) {
      return fail(
        context,
        409,
        "push_subscription_missing",
        "Нет активной push-подписки для этого устройства"
      )
    }

    return ok(context, {
      sent: sent ?? 0,
    })
  })

  app.delete("/push/subscriptions", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = deletePushSubscriptionRequestSchema.parse(
        await context.req.json()
      )

      await agent.pushNotifications.deleteSubscription(
        auth.user.id,
        body.endpoint
      )

      return ok(context, {
        subscribed: false,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      throw error
    }
  })

  return app
}
