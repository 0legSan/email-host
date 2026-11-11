import { Hono } from "hono"
import { ZodError } from "zod"

import { publicIdSchema, sendMessageRequestSchema } from "../contracts"
import type { MailAgent } from "../mail-agent"
import { MailEngineError } from "../mail-engine"
import { OutboundPayloadConflictError } from "../services"
import { requireUser } from "./auth-context"
import { fail, ok } from "./responses"

export function createMailSendRoutes(agent: MailAgent) {
  const app = new Hono()

  app.get("/mail/tracking/open/:messageId", async (context) => {
    const messageId = publicIdSchema.safeParse(context.req.param("messageId"))

    if (messageId.success) {
      await agent.mailSender.recordOpen(messageId.data)
    }

    return trackingPixelResponse()
  })

  app.get("/mail/tracking/click/:linkId", async (context) => {
    const linkId = publicIdSchema.safeParse(context.req.param("linkId"))

    if (!linkId.success) {
      return fail(context, 404, "link_not_found", "Link not found")
    }

    const targetUrl = await agent.mailSender.recordClick(linkId.data)

    if (!targetUrl) {
      return fail(context, 404, "link_not_found", "Link not found")
    }

    return context.redirect(targetUrl, 302)
  })

  app.post("/mail/send", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = sendMessageRequestSchema.parse(await context.req.json())
      const outboundMessage = await agent.mailSender.sendMessage(
        auth.user.id,
        body
      )

      if (!outboundMessage) {
        return fail(context, 404, "account_not_found", "Account not found")
      }

      if (outboundMessage.status === "failed") {
        return fail(
          context,
          503,
          "send_failed",
          outboundMessage.lastError ?? "Send failed"
        )
      }

      return ok(context, {
        outboundMessage,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      if (error instanceof OutboundPayloadConflictError) {
        return fail(
          context,
          409,
          "client_request_conflict",
          "Client request id is already used for another send payload"
        )
      }

      if (error instanceof MailEngineError) {
        return fail(
          context,
          503,
          "mail_provider_unavailable",
          "Mail provider is not available"
        )
      }

      throw error
    }
  })

  return app
}

const transparentGif = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33,
  249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
])

function trackingPixelResponse() {
  return new Response(transparentGif, {
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-length": String(transparentGif.byteLength),
      "content-type": "image/gif",
    },
  })
}
