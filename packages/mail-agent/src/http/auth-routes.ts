import { deleteCookie, getCookie } from "hono/cookie"
import { Hono } from "hono"
import type { Context } from "hono"
import { ZodError } from "zod"

import {
  createPasswordResetLinkRequestSchema,
  createRegistrationInviteRequestSchema,
  loginRequestSchema,
  passwordResetTokenSchema,
  publicIdSchema,
  registerWithInviteRequestSchema,
  registrationInviteTokenSchema,
  resetPasswordRequestSchema,
} from "../contracts"
import type { MailAgent } from "../mail-agent"
import { sessionCookieName } from "../auth/session"
import { requireUser, setSessionCookie } from "./auth-context"
import {
  OwnerUserMutationForbiddenError,
  PasswordResetLinkInvalidError,
  RegistrationInviteInvalidError,
  toUserDto,
  UserDeactivatedError,
  UserEmailAlreadyRegisteredError,
  UserNotFoundError,
} from "../services/auth-service"
import { fail, ok } from "./responses"

export function createAuthRoutes(agent: MailAgent) {
  const app = new Hono()

  app.get("/auth/jwks", (context) => {
    return context.json(agent.convexJwt.getJwks())
  })

  app.get("/auth/convex-token", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    return ok(context, {
      token: await agent.convexJwt.createToken(auth.user),
    })
  })

  app.get("/auth/registration-invites/:token", async (context) => {
    const token = registrationInviteTokenSchema.safeParse(
      context.req.param("token")
    )

    if (!token.success) {
      return fail(context, 404, "invite_not_found", "Invite not found")
    }

    const invite = await agent.auth.getRegistrationInvite(token.data)

    if (!invite) {
      return fail(context, 404, "invite_not_found", "Invite not found")
    }

    return ok(context, {
      invite,
    })
  })

  app.post("/auth/registration-invites", async (context) => {
    const auth = await requireOwner(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    try {
      const body = createRegistrationInviteRequestSchema.parse(
        await context.req.json()
      )
      const invite = await agent.auth.createRegistrationInvite(
        auth.user.id,
        body
      )

      return ok(context, {
        invite,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      throw error
    }
  })

  app.get("/auth/users", async (context) => {
    const auth = await requireOwner(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    return ok(context, {
      users: await agent.auth.listManagedUsers(),
    })
  })

  app.post("/auth/users/:userId/deactivate", async (context) => {
    const auth = await requireOwner(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const userId = publicIdSchema.safeParse(context.req.param("userId"))

    if (!userId.success) {
      return fail(context, 404, "user_not_found", "User not found")
    }

    try {
      const user = await agent.auth.deactivateManagedUser(
        auth.user.id,
        userId.data
      )

      return ok(context, {
        user,
      })
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        return fail(context, 404, "user_not_found", "User not found")
      }

      if (error instanceof OwnerUserMutationForbiddenError) {
        return fail(context, 403, "forbidden", "Forbidden")
      }

      throw error
    }
  })

  app.post("/auth/users/:userId/password-reset-links", async (context) => {
    const auth = await requireOwner(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    const userId = publicIdSchema.safeParse(context.req.param("userId"))

    if (!userId.success) {
      return fail(context, 404, "user_not_found", "User not found")
    }

    try {
      const body = createPasswordResetLinkRequestSchema.parse(
        await context.req.json()
      )
      const result = await agent.auth.createPasswordResetLink(
        auth.user.id,
        userId.data,
        body
      )

      return ok(context, result)
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      if (error instanceof UserNotFoundError) {
        return fail(context, 404, "user_not_found", "User not found")
      }

      if (error instanceof UserDeactivatedError) {
        return fail(context, 409, "user_deactivated", "User is deactivated")
      }

      throw error
    }
  })

  app.post("/auth/register", async (context) => {
    try {
      const body = registerWithInviteRequestSchema.parse(
        await context.req.json()
      )
      const session = await agent.auth.registerWithInvite(body)

      setSessionCookie(context, agent, session.token, session.expiresAt)

      return ok(context, {
        user: session.user,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      if (error instanceof RegistrationInviteInvalidError) {
        return fail(context, 404, "invite_not_found", "Invite not found")
      }

      if (error instanceof UserEmailAlreadyRegisteredError) {
        return fail(
          context,
          409,
          "email_already_registered",
          "Email is already registered"
        )
      }

      throw error
    }
  })

  app.get("/auth/password-reset-links/:token", async (context) => {
    const token = passwordResetTokenSchema.safeParse(context.req.param("token"))

    if (!token.success) {
      return fail(context, 404, "reset_link_not_found", "Reset link not found")
    }

    const link = await agent.auth.getPasswordResetLink(token.data)

    if (!link) {
      return fail(context, 404, "reset_link_not_found", "Reset link not found")
    }

    return ok(context, {
      link,
    })
  })

  app.post("/auth/reset-password", async (context) => {
    try {
      const body = resetPasswordRequestSchema.parse(await context.req.json())
      const session = await agent.auth.resetPassword(body)

      setSessionCookie(context, agent, session.token, session.expiresAt)

      return ok(context, {
        user: session.user,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      if (error instanceof PasswordResetLinkInvalidError) {
        return fail(
          context,
          404,
          "reset_link_not_found",
          "Reset link not found"
        )
      }

      throw error
    }
  })

  app.post("/auth/login", async (context) => {
    try {
      const body = loginRequestSchema.parse(await context.req.json())
      const session = await agent.auth.login(body.email, body.password)

      if (!session) {
        return fail(context, 401, "invalid_credentials", "Invalid credentials")
      }

      setSessionCookie(context, agent, session.token, session.expiresAt)

      return ok(context, {
        user: session.user,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return fail(context, 422, "invalid_request", "Invalid request")
      }

      throw error
    }
  })

  app.post("/auth/logout", async (context) => {
    const token = getCookie(context, sessionCookieName)

    if (token) {
      await agent.auth.logout(token)
    }

    deleteCookie(context, sessionCookieName, {
      path: "/",
    })

    return ok(context, {
      loggedOut: true,
    })
  })

  app.get("/me", async (context) => {
    const auth = await requireUser(context, agent)

    if ("response" in auth) {
      return auth.response
    }

    return ok(context, {
      user: toUserDto(auth.user),
    })
  })

  return app
}

async function requireOwner(context: Context, agent: MailAgent) {
  const auth = await requireUser(context, agent)

  if ("response" in auth) {
    return auth
  }

  if (auth.user.role !== "owner") {
    return {
      response: fail(context, 403, "forbidden", "Forbidden"),
    }
  }

  return auth
}
