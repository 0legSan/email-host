import { z } from "zod"

import { isValidMailCredentialSecret } from "../credentials/credential-encryption"

export const mailAgentConfigSchema = z.object({
  convexUrl: z.url(),
  convexAdminKey: z.string().min(1),
  convexJwtIssuer: z.url(),
  convexJwtKeyId: z.string().min(1),
  convexJwtPrivateKey: z.string().min(1),
  convexJwtPublicJwk: z.record(z.string(), z.unknown()),
  appBaseUrl: z.url(),
  webOrigins: z.array(z.url()).min(1),
  sessionSecret: z.string().min(16),
  ownerEmail: z.email(),
  ownerPassword: z.string().min(8),
  mailCredentialSecret: z.string().refine(isValidMailCredentialSecret, {
    message: "MAIL_CREDENTIAL_SECRET must decode to 32 bytes",
  }),
  mailSyncIntervalSeconds: z.coerce.number().int().positive().default(60),
  mailFallbackInboxPollIntervalSeconds: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  mailRealtimeSafetyPollIntervalSeconds: z.coerce
    .number()
    .int()
    .positive()
    .default(600),
  mailBegetConnectionInitialIntervalSeconds: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  mailBegetConnectionMinIntervalSeconds: z.coerce
    .number()
    .int()
    .positive()
    .default(40),
  mailBegetConnectionMaxIntervalSeconds: z.coerce
    .number()
    .int()
    .positive()
    .default(120),
  mailInitialSyncLimitPerMailbox: z.coerce
    .number()
    .int()
    .positive()
    .default(500),
  mailServerRecentMessageCacheSize: z.coerce
    .number()
    .int()
    .min(150)
    .default(300),
  mailServerRecentBodyCacheSize: z.coerce.number().int().min(150).default(150),
  webPushVapidSubject: z.string().min(1).optional(),
  webPushVapidPublicKey: z.string().min(1).optional(),
  webPushVapidPrivateKey: z.string().min(1).optional(),
  appReleaseVersion: z.string().min(1).optional(),
})

export type MailAgentConfig = z.infer<typeof mailAgentConfigSchema>

export function parseMailAgentConfig(env: NodeJS.ProcessEnv): MailAgentConfig {
  return mailAgentConfigSchema.parse({
    convexUrl: env.CONVEX_SELF_HOSTED_URL,
    convexAdminKey: env.CONVEX_SELF_HOSTED_ADMIN_KEY,
    convexJwtIssuer: env.CONVEX_AUTH_ISSUER ?? env.APP_BASE_URL,
    convexJwtKeyId: env.CONVEX_JWT_KEY_ID,
    convexJwtPrivateKey: decodeEscapedNewlines(env.CONVEX_JWT_PRIVATE_KEY),
    convexJwtPublicJwk: parseJsonObject(env.CONVEX_JWT_PUBLIC_JWK),
    appBaseUrl: env.APP_BASE_URL,
    webOrigins: parseUrlList(env.WEB_ORIGINS ?? env.WEB_ORIGIN),
    sessionSecret: env.SESSION_SECRET,
    ownerEmail: env.OWNER_EMAIL,
    ownerPassword: env.OWNER_PASSWORD,
    mailCredentialSecret: env.MAIL_CREDENTIAL_SECRET,
    mailSyncIntervalSeconds: readOptionalEnv(env.MAIL_SYNC_INTERVAL_SECONDS),
    mailFallbackInboxPollIntervalSeconds: readOptionalEnv(
      env.MAIL_FALLBACK_INBOX_POLL_INTERVAL_SECONDS
    ),
    mailRealtimeSafetyPollIntervalSeconds: readOptionalEnv(
      env.MAIL_REALTIME_SAFETY_POLL_INTERVAL_SECONDS
    ),
    mailBegetConnectionInitialIntervalSeconds: readOptionalEnv(
      env.MAIL_BEGET_CONNECTION_INITIAL_INTERVAL_SECONDS
    ),
    mailBegetConnectionMinIntervalSeconds: readOptionalEnv(
      env.MAIL_BEGET_CONNECTION_MIN_INTERVAL_SECONDS
    ),
    mailBegetConnectionMaxIntervalSeconds: readOptionalEnv(
      env.MAIL_BEGET_CONNECTION_MAX_INTERVAL_SECONDS
    ),
    mailInitialSyncLimitPerMailbox: readOptionalEnv(
      env.MAIL_INITIAL_SYNC_LIMIT_PER_MAILBOX
    ),
    mailServerRecentMessageCacheSize: readOptionalEnv(
      env.MAIL_SERVER_RECENT_MESSAGE_CACHE_SIZE
    ),
    mailServerRecentBodyCacheSize: readOptionalEnv(
      env.MAIL_SERVER_RECENT_BODY_CACHE_SIZE
    ),
    webPushVapidSubject:
      readOptionalEnv(env.WEB_PUSH_VAPID_SUBJECT) ??
      `mailto:${env.OWNER_EMAIL ?? ""}`,
    webPushVapidPublicKey: readOptionalEnv(env.WEB_PUSH_VAPID_PUBLIC_KEY),
    webPushVapidPrivateKey: readOptionalEnv(env.WEB_PUSH_VAPID_PRIVATE_KEY),
    appReleaseVersion: readOptionalEnv(env.APP_RELEASE_VERSION),
  })
}

function parseUrlList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function readOptionalEnv(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : undefined
}

function decodeEscapedNewlines(value: string | undefined) {
  return value?.replaceAll("\\n", "\n")
}

function parseJsonObject(value: string | undefined) {
  if (!value) {
    return undefined
  }

  const parsed: unknown = JSON.parse(value)

  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : undefined
}
