import { createHmac, randomBytes } from "crypto"

export const sessionCookieName = "email_host_session"
export const sessionTtlDays = 400

const dayMs = 24 * 60 * 60 * 1000

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashSessionToken(token: string, sessionSecret: string): string {
  return createHmac("sha256", sessionSecret).update(token).digest("base64url")
}

export function createSessionExpiry(now = new Date()): Date {
  return new Date(now.getTime() + sessionTtlDays * dayMs)
}
