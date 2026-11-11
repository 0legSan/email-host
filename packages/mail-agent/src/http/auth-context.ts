import { getCookie, setCookie } from "hono/cookie"
import type { Context } from "hono"

import { sessionCookieName } from "../auth/session"
import type { UserRow } from "../services/auth-service"
import type { MailAgent } from "../mail-agent"
import { fail } from "./responses"

const sessionRefreshThresholdMs = 30 * 24 * 60 * 60 * 1000

export function setSessionCookie(
  context: Context,
  agent: MailAgent,
  token: string,
  expiresAt: Date
) {
  setCookie(context, sessionCookieName, token, {
    httpOnly: true,
    secure: agent.config.appBaseUrl.startsWith("https://"),
    sameSite: "Lax",
    path: "/",
    expires: expiresAt,
  })
}

export async function requireUser(
  context: Context,
  agent: MailAgent
): Promise<{ user: UserRow } | { response: Response }> {
  const token = getCookie(context, sessionCookieName)

  if (!token) {
    return {
      response: fail(context, 401, "unauthorized", "Unauthorized"),
    }
  }

  const session = await agent.auth.getSessionByToken(token)

  if (!session) {
    return {
      response: fail(context, 401, "unauthorized", "Unauthorized"),
    }
  }

  if (shouldRefreshSession(session.expiresAt)) {
    const expiresAt = await agent.auth.refreshSession(token)
    setSessionCookie(context, agent, token, expiresAt)
  }

  return {
    user: session.user,
  }
}

function shouldRefreshSession(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() - now.getTime() <= sessionRefreshThresholdMs
}
