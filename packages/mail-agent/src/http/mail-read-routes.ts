import { type Context, Hono } from "hono"
import { z, ZodError } from "zod"

import {
  moveMessageRequestSchema,
  publicIdSchema,
  updateMessageRequestSchema,
} from "../contracts"
import type { MailAgent } from "../mail-agent"
import { getMailEngineErrorLogDetails, MailEngineError } from "../mail-engine"
import { requireUser } from "./auth-context"
import { fail, ok } from "./responses"

const dateQuerySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const listMessagesQuerySchema = z.object({
  path: z.string().min(1).default("INBOX"),
  cursor: z.string().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(30),
  q: z.string().trim().min(1).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).optional(),
  after: dateQuerySchema.optional(),
  before: dateQuerySchema.optional(),
  hasAttachments: z.enum(["true", "false"]).optional(),
  unread: z.enum(["true", "false"]).optional(),
  flagged: z.enum(["true", "false"]).optional(),
})

const listUnifiedMessagesQuerySchema = z.object({
  accountId: publicIdSchema.optional(),
  accountIds: z.string().min(1).optional(),
  searchMode: z.enum(["true", "false"]).optional(),
  path: z.string().min(1).optional(),
  specialUse: z.string().min(1).optional(),
  customFolders: z.enum(["true", "false"]).optional(),
  cursor: z.string().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  q: z.string().trim().min(1).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  subject: z.string().trim().min(1).optional(),
  after: dateQuerySchema.optional(),
  before: dateQuerySchema.optional(),
  hasAttachments: z.enum(["true", "false"]).optional(),
  unread: z.enum(["true", "false"]).optional(),
  flagged: z.enum(["true", "false"]).optional(),
})

const syncLocalRequestSchema = z.object({
  path: z.string().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  pageLimit: z.number().int().min(1).max(20).optional(),
})

const getMessageQuerySchema = z.object({
  messageId: z.string().min(1),
})

const batchMessagesRequestSchema = z.object({
  messageIds: z.array(publicIdSchema).min(1).max(20),
})

export function createMailReadRoutes(agent: MailAgent) {
  const app = new Hono()

  app.get("/mail/accounts/:accountId/mailboxes", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const accountId = publicIdSchema.safeParse(context.req.param("accountId"))

    if (!accountId.success) {
      return fail(context, 404, "account_not_found", "Account not found")
    }

    try {
      const mailboxes = await agent.mail.listMailboxes(
        auth.user.id,
        accountId.data
      )

      if (!mailboxes) {
        return fail(context, 404, "account_not_found", "Account not found")
      }

      return ok(context, {
        mailboxes,
      })
    } catch (error) {
      return handleMailEngineError(context, error)
    }
  })

  app.get("/mail/accounts/:accountId/messages", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const accountId = publicIdSchema.safeParse(context.req.param("accountId"))

    if (!accountId.success) {
      return fail(context, 404, "account_not_found", "Account not found")
    }

    try {
      const query = listMessagesQuerySchema.parse({
        path: context.req.query("path"),
        cursor: context.req.query("cursor"),
        pageSize: context.req.query("pageSize"),
        q: context.req.query("q"),
        from: context.req.query("from"),
        to: context.req.query("to"),
        subject: context.req.query("subject"),
        after: context.req.query("after"),
        before: context.req.query("before"),
        hasAttachments: context.req.query("hasAttachments"),
        unread: context.req.query("unread"),
        flagged: context.req.query("flagged"),
      })
      const result = await agent.mail.listMessages(
        auth.user.id,
        accountId.data,
        {
          ...query,
          hasAttachments: query.hasAttachments === "true" ? true : undefined,
          unread: query.unread === "true" ? true : undefined,
          flagged: query.flagged === "true" ? true : undefined,
        }
      )

      if (!result) {
        return fail(context, 404, "account_not_found", "Account not found")
      }

      return ok(context, result)
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      return handleMailEngineError(context, error)
    }
  })

  app.get("/mail/messages", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const query = listUnifiedMessagesQuerySchema.parse({
        accountId: context.req.query("accountId"),
        accountIds: context.req.query("accountIds"),
        searchMode: context.req.query("searchMode"),
        path: context.req.query("path"),
        specialUse: context.req.query("specialUse"),
        customFolders: context.req.query("customFolders"),
        cursor: context.req.query("cursor"),
        pageSize: context.req.query("pageSize"),
        q: context.req.query("q"),
        from: context.req.query("from"),
        to: context.req.query("to"),
        subject: context.req.query("subject"),
        after: context.req.query("after"),
        before: context.req.query("before"),
        hasAttachments: context.req.query("hasAttachments"),
        unread: context.req.query("unread"),
        flagged: context.req.query("flagged"),
      })
      const accountPublicIds = parseAccountIds(query.accountIds)

      if (accountPublicIds === false) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      const result = await agent.mail.listStoredMessages(auth.user.id, {
        accountPublicId: query.accountId,
        accountPublicIds,
        searchMode: query.searchMode === "true",
        path: query.path,
        specialUse: query.specialUse,
        customFolders: query.customFolders === "true" ? true : undefined,
        cursor: query.cursor,
        pageSize: query.pageSize,
        q: query.q,
        from: query.from,
        to: query.to,
        subject: query.subject,
        after: query.after,
        before: query.before,
        hasAttachments: query.hasAttachments === "true" ? true : undefined,
        unread: query.unread === "true" ? true : undefined,
        flagged: query.flagged === "true" ? true : undefined,
      })

      return ok(context, result)
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      return handleMailEngineError(context, error)
    }
  })

  app.get("/mail/accounts/:accountId/message", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const accountId = publicIdSchema.safeParse(context.req.param("accountId"))

    if (!accountId.success) {
      return fail(context, 404, "account_not_found", "Account not found")
    }

    try {
      const query = getMessageQuerySchema.parse({
        messageId: context.req.query("messageId"),
      })
      const message = await agent.mail.getMessage(
        auth.user.id,
        accountId.data,
        query.messageId
      )

      if (!message) {
        return fail(context, 404, "message_not_found", "Message not found")
      }

      return ok(context, {
        message,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      return handleMailEngineError(context, error)
    }
  })

  app.post("/mail/messages/batch", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = batchMessagesRequestSchema.parse(await context.req.json())
      const messages = await agent.mail.listCachedStoredMessages(
        auth.user.id,
        body.messageIds
      )

      return ok(context, {
        messages,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      return handleMailEngineError(context, error)
    }
  })

  app.get("/mail/messages/:messageId", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const messageId = publicIdSchema.safeParse(context.req.param("messageId"))

    if (!messageId.success) {
      return fail(context, 404, "message_not_found", "Message not found")
    }

    try {
      const message = await agent.mail.getStoredMessage(
        auth.user.id,
        messageId.data
      )

      if (!message) {
        return fail(context, 404, "message_not_found", "Message not found")
      }

      return ok(context, {
        message,
      })
    } catch (error) {
      return handleMailEngineError(context, error)
    }
  })

  app.get("/mail/messages/:messageId/thread", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const messageId = publicIdSchema.safeParse(context.req.param("messageId"))

    if (!messageId.success) {
      return fail(context, 404, "message_not_found", "Message not found")
    }

    try {
      const thread = await agent.mail.getMessageThread(
        auth.user.id,
        messageId.data
      )

      if (!thread) {
        return fail(context, 404, "message_not_found", "Message not found")
      }

      return ok(context, {
        thread,
      })
    } catch (error) {
      return handleMailEngineError(context, error)
    }
  })

  app.get(
    "/mail/messages/:messageId/attachments/:attachmentId",
    async (context) => {
      const auth = await requireUser(context, agent)

      if ("response" in auth) {
        return auth.response
      }

      const messageId = publicIdSchema.safeParse(context.req.param("messageId"))
      const attachmentId = publicIdSchema.safeParse(
        context.req.param("attachmentId")
      )

      if (!messageId.success || !attachmentId.success) {
        return fail(
          context,
          404,
          "attachment_not_found",
          "Attachment not found"
        )
      }

      try {
        const attachment = await agent.mail.getAttachment(
          auth.user.id,
          messageId.data,
          attachmentId.data
        )

        return respondWithAttachment(context, attachment)
      } catch (error) {
        return handleMailEngineError(context, error)
      }
    }
  )

  app.get("/mail/attachments/:attachmentId", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const attachmentId = publicIdSchema.safeParse(
      context.req.param("attachmentId")
    )

    if (!attachmentId.success) {
      return fail(context, 404, "attachment_not_found", "Attachment not found")
    }

    try {
      const attachment = await agent.mail.getAttachment(
        auth.user.id,
        null,
        attachmentId.data
      )

      return respondWithAttachment(context, attachment)
    } catch (error) {
      return handleMailEngineError(context, error)
    }
  })

  app.patch("/mail/messages/:messageId", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const messageId = publicIdSchema.safeParse(context.req.param("messageId"))

    if (!messageId.success) {
      return fail(context, 404, "message_not_found", "Message not found")
    }

    try {
      const body = updateMessageRequestSchema.parse(await context.req.json())
      const message = await agent.mail.updateStoredMessage(
        auth.user.id,
        messageId.data,
        body
      )

      if (!message) {
        return fail(context, 404, "message_not_found", "Message not found")
      }

      return ok(context, {
        message,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      return handleMailEngineError(context, error)
    }
  })

  app.post("/mail/messages/:messageId/move", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const messageId = publicIdSchema.safeParse(context.req.param("messageId"))

    if (!messageId.success) {
      return fail(context, 404, "message_not_found", "Message not found")
    }

    try {
      const body = moveMessageRequestSchema.parse(await context.req.json())
      const message = await agent.mail.moveStoredMessage(
        auth.user.id,
        messageId.data,
        body.path
      )

      if (!message) {
        return fail(context, 404, "message_not_found", "Message not found")
      }

      return ok(context, {
        message,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      return handleMailEngineError(context, error)
    }
  })

  app.post("/mail/accounts/:accountId/sync-local", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const accountId = publicIdSchema.safeParse(context.req.param("accountId"))

    if (!accountId.success) {
      return fail(context, 404, "account_not_found", "Account not found")
    }

    try {
      const bodyText = await context.req.text()
      const body = bodyText ? JSON.parse(bodyText) : {}
      const request = syncLocalRequestSchema.parse(body)
      const queued = await agent.mail.requestAccountSync(
        auth.user.id,
        accountId.data,
        request
      )

      if (!queued) {
        return fail(context, 404, "account_not_found", "Account not found")
      }

      return ok(context, { queued: true })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      return handleMailEngineError(context, error)
    }
  })

  return app
}

type AttachmentResponse = Awaited<
  ReturnType<MailAgent["mail"]["getAttachment"]>
>

function respondWithAttachment(
  context: Context,
  attachment: AttachmentResponse
) {
  if (!attachment) {
    return fail(context, 404, "attachment_not_found", "Attachment not found")
  }

  return new Response(new Uint8Array(attachment.content), {
    headers: {
      "content-type": attachment.contentType,
      "content-disposition": `attachment; filename="${getAttachmentFilename(
        attachment.filename
      )}"`,
    },
  })
}

function parseAccountIds(value: string | undefined) {
  if (!value) {
    return undefined
  }

  const accountIds = value
    .split(",")
    .map((accountId) => accountId.trim())
    .filter(Boolean)

  if (
    accountIds.length === 0 ||
    accountIds.some((accountId) => !publicIdSchema.safeParse(accountId).success)
  ) {
    return false
  }

  return [...new Set(accountIds)]
}

function handleMailEngineError(
  context: Parameters<typeof fail>[0],
  error: unknown
) {
  if (error instanceof MailEngineError) {
    if (error.code === "auth_error") {
      return fail(
        context,
        401,
        "invalid_provider_credentials",
        "Mail provider rejected credentials"
      )
    }

    console.error(
      "Mail provider request failed",
      getMailEngineErrorLogDetails(error)
    )

    return fail(
      context,
      503,
      "mail_provider_unavailable",
      "Mail provider is not available"
    )
  }

  throw error
}

function getAttachmentFilename(value: string | null) {
  const sanitized = value
    ?.replace(/[\r\n"\\]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .trim()

  return sanitized && sanitized.length > 0 ? sanitized : "attachment"
}
