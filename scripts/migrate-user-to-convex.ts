import { timingSafeEqual } from "node:crypto"

import { Client } from "pg"

import { internal } from "../convex/_generated/api"
import { MailAgentConvexClient } from "../packages/mail-agent/src/convex/client"

const apply = process.argv.includes("--apply")
const authErrorProvider = readOptionalProviderArg("--mark-auth-error-provider=")
const sourceUserEmail = requireEnv("SOURCE_USER_EMAIL")
  .trim()
  .toLocaleLowerCase()
const sourceDatabaseUrl = requireEnv("SOURCE_DATABASE_URL")
verifyCredentialSecrets(
  requireEnv("SOURCE_MAIL_CREDENTIAL_SECRET"),
  requireEnv("MAIL_CREDENTIAL_SECRET")
)

const source = new Client({
  connectionString: sourceDatabaseUrl,
  application_name: "email-host-convex-user-migration",
})

await source.connect()
try {
  await source.query("begin transaction read only")
  const bundle = await readUserBundle(source, sourceUserEmail)
  await source.query("rollback")

  const manifest = {
    mode: apply ? "apply" : "dry-run",
    user: { role: "user" as const },
    accounts: bundle.accounts.length,
    profiles: bundle.profiles.length,
    preferences: bundle.preferences !== undefined,
    pushSubscriptions: bundle.pushSubscriptions.length,
    activeSessionsExcluded: bundle.activeSessions,
    activeDraftsExcluded: bundle.activeDrafts,
    unsentOutboundExcluded: bundle.unsentOutbound,
    cachedMessagesExcluded: bundle.cachedMessages,
    mailboxesExcluded: bundle.mailboxes,
    otherUsersExcluded: bundle.otherUsers,
    importedMessages: 0,
    importedSessions: 0,
  }
  validateProductionManifest(manifest)
  console.log(JSON.stringify(manifest, null, 2))

  if (apply) {
    const convex = new MailAgentConvexClient(
      requireEnv("CONVEX_SELF_HOSTED_URL"),
      requireEnv("CONVEX_SELF_HOSTED_ADMIN_KEY")
    )
    try {
      const before = await inspectTarget(convex, bundle)
      console.log(JSON.stringify({ targetBefore: before }, null, 2))
      assertSafeTarget(before, false)
      const result = await convex.mutation(
        internal.migrationInternal.importUserBundle,
        {
          user: bundle.user,
          preferences: bundle.preferences,
          accounts: bundle.accounts,
          profiles: bundle.profiles,
          pushSubscriptions: bundle.pushSubscriptions,
        }
      )
      let authErrorMarked = false
      if (authErrorProvider) {
        const matchingAccounts = bundle.accounts.filter(
          (account) => account.provider === authErrorProvider
        )
        if (matchingAccounts.length !== 1) {
          throw new Error(
            `Expected exactly one ${authErrorProvider} account to mark`
          )
        }
        await convex.mutation(
          internal.migrationInternal.markMigratedAccountAuthError,
          {
            userPublicId: bundle.user.publicId,
            userEmail: bundle.user.email,
            accountPublicId: matchingAccounts[0].publicId,
          }
        )
        authErrorMarked = true
      }
      const target = await inspectTarget(convex, bundle)
      assertSafeTarget(target, true)
      console.log(
        JSON.stringify(
          {
            applied: {
              accounts: result.accounts,
              profiles: result.profiles,
              preferences: result.preferences,
              pushSubscriptions: result.pushSubscriptions,
              authErrorMarked,
            },
            target,
          },
          null,
          2
        )
      )
    } finally {
      await convex.close()
    }
  }
} finally {
  await source.end()
}

async function readUserBundle(client: Client, email: string) {
  const users = await client.query<UserRow>(
    `select
       id,
       public_id as "publicId",
       email,
       password_hash as "passwordHash",
       display_name as "displayName",
       created_at as "createdAt",
       updated_at as "updatedAt"
     from users
     where lower(email) = $1 and role = 'user' and deleted_at is null
     order by id`,
    [email]
  )
  if (users.rows.length !== 1) {
    throw new Error(
      `Expected exactly one active regular user for SOURCE_USER_EMAIL, found ${users.rows.length}`
    )
  }
  const user = users.rows[0]!
  const otherUsers = await count(
    client,
    "select count(*)::text as count from users where id <> $1",
    [user.id]
  )
  const accountCount = await count(
    client,
    "select count(*)::text as count from mail_accounts where user_id = $1 and deleted_at is null",
    [user.id]
  )
  const preferences = await client.query<PreferencesRow>(
    `select sidebar_order as "sidebarOrder", signatures,
            created_at as "createdAt", updated_at as "updatedAt"
     from user_mail_preferences where user_id = $1`,
    [user.id]
  )
  const accounts = await client.query<AccountRow>(
    `select
         account.id,
         account.public_id as "publicId",
         account.emailengine_account_id as "emailengineAccountId",
         account.provider,
         account.address,
         account.label,
         account.display_name as "displayName",
         account.created_at as "createdAt",
         account.updated_at as "updatedAt",
         credential.imap_host as "imapHost",
         credential.imap_port as "imapPort",
         credential.imap_secure as "imapSecure",
         credential.imap_username as "imapUsername",
         credential.imap_password_ciphertext as "imapPasswordCiphertext",
         credential.imap_password_iv as "imapPasswordIv",
         credential.imap_password_tag as "imapPasswordTag",
         credential.smtp_host as "smtpHost",
         credential.smtp_port as "smtpPort",
         credential.smtp_secure as "smtpSecure",
         credential.smtp_username as "smtpUsername",
         credential.smtp_password_ciphertext as "smtpPasswordCiphertext",
         credential.smtp_password_iv as "smtpPasswordIv",
         credential.smtp_password_tag as "smtpPasswordTag"
       from mail_accounts account
       join mail_account_credentials credential on credential.account_id = account.id
       where account.user_id = $1 and account.deleted_at is null
     order by account.id`,
    [user.id]
  )
  const profiles = await client.query<ProfileRow>(
    `select id, public_id as "publicId", name,
            created_at as "createdAt", updated_at as "updatedAt"
     from mail_account_profiles
     where user_id = $1 and deleted_at is null
     order by id`,
    [user.id]
  )
  const members = await client.query<ProfileMemberRow>(
    `select member.profile_id as "profileId",
            account.public_id as "accountPublicId"
     from mail_account_profile_members member
     join mail_account_profiles profile on profile.id = member.profile_id
     join mail_accounts account on account.id = member.account_id
     where profile.user_id = $1 and profile.deleted_at is null
       and account.user_id = $1 and account.deleted_at is null
     order by member.profile_id, member.sort_order`,
    [user.id]
  )
  const pushSubscriptions = await client.query<PushSubscriptionRow>(
    `select endpoint, p256dh, auth,
            expiration_time as "expirationTime",
            user_agent as "userAgent",
            created_at as "createdAt", updated_at as "updatedAt"
     from push_subscriptions where user_id = $1 order by id`,
    [user.id]
  )
  const activeSessions = await count(
    client,
    `select count(*)::text as count from sessions
     where user_id = $1 and revoked_at is null and expires_at > now()`,
    [user.id]
  )
  const activeDrafts = await count(
    client,
    `select count(*)::text as count from mail_drafts
     where user_id = $1 and deleted_at is null
       and status in ('draft', 'sending', 'failed')`,
    [user.id]
  )
  const unsentOutbound = await count(
    client,
    `select count(*)::text as count from outbound_messages
     where user_id = $1 and status <> 'sent'`,
    [user.id]
  )
  const cachedMessages = await count(
    client,
    `select count(*)::text as count from mail_messages message
     join mail_accounts account on account.id = message.account_id
     where account.user_id = $1 and message.deleted_at is null`,
    [user.id]
  )
  const mailboxes = await count(
    client,
    `select count(*)::text as count from mailboxes mailbox
     join mail_accounts account on account.id = mailbox.account_id
     where account.user_id = $1 and mailbox.deleted_at is null`,
    [user.id]
  )
  if (accountCount !== accounts.rows.length) {
    throw new Error("Every active source account must have one credential row")
  }

  const membersByProfile = new Map<number, string[]>()
  for (const member of members.rows) {
    const accountPublicIds = membersByProfile.get(member.profileId) ?? []
    accountPublicIds.push(member.accountPublicId)
    membersByProfile.set(member.profileId, accountPublicIds)
  }

  return {
    user: {
      publicId: user.publicId,
      email: user.email.toLocaleLowerCase(),
      passwordHash: user.passwordHash,
      displayName: user.displayName ?? undefined,
      createdAt: user.createdAt.getTime(),
      updatedAt: user.updatedAt.getTime(),
    },
    preferences: preferences.rows[0]
      ? {
          sidebarOrder: preferences.rows[0].sidebarOrder,
          signatures: preferences.rows[0].signatures,
          createdAt: preferences.rows[0].createdAt.getTime(),
          updatedAt: preferences.rows[0].updatedAt.getTime(),
        }
      : undefined,
    accounts: accounts.rows.map(toAccountBundle),
    profiles: profiles.rows.map((profile) => ({
      publicId: profile.publicId,
      name: profile.name,
      accountPublicIds: membersByProfile.get(profile.id) ?? [],
      createdAt: profile.createdAt.getTime(),
      updatedAt: profile.updatedAt.getTime(),
    })),
    pushSubscriptions: pushSubscriptions.rows.map((subscription) => ({
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      expirationTime: subscription.expirationTime?.getTime(),
      userAgent: subscription.userAgent ?? undefined,
      createdAt: subscription.createdAt.getTime(),
      updatedAt: subscription.updatedAt.getTime(),
    })),
    activeSessions,
    activeDrafts,
    unsentOutbound,
    cachedMessages,
    mailboxes,
    otherUsers,
  }
}

function toAccountBundle(account: AccountRow) {
  return {
    publicId: account.publicId,
    emailengineAccountId: account.emailengineAccountId,
    provider: account.provider,
    address: account.address,
    label: account.label ?? undefined,
    displayName: account.displayName ?? undefined,
    createdAt: account.createdAt.getTime(),
    updatedAt: account.updatedAt.getTime(),
    credentials: {
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapSecure: account.imapSecure,
      imapUsername: account.imapUsername,
      imapPasswordCiphertext: account.imapPasswordCiphertext,
      imapPasswordIv: account.imapPasswordIv,
      imapPasswordTag: account.imapPasswordTag,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpSecure: account.smtpSecure,
      smtpUsername: account.smtpUsername,
      smtpPasswordCiphertext: account.smtpPasswordCiphertext,
      smtpPasswordIv: account.smtpPasswordIv,
      smtpPasswordTag: account.smtpPasswordTag,
    },
  }
}

async function count(client: Client, sql: string, values: unknown[]) {
  const result = await client.query<{ count: string }>(sql, values)
  return Number(result.rows[0]?.count ?? 0)
}

async function inspectTarget(
  convex: MailAgentConvexClient,
  bundle: Awaited<ReturnType<typeof readUserBundle>>
) {
  return await convex.query(internal.migrationInternal.inspectUserMigration, {
    publicId: bundle.user.publicId,
    email: bundle.user.email,
    passwordHash: bundle.user.passwordHash,
  })
}

function validateProductionManifest(manifest: {
  accounts: number
  preferences: boolean
  pushSubscriptions: number
  activeDraftsExcluded: number
  unsentOutboundExcluded: number
}) {
  if (
    manifest.accounts !== 2 ||
    !manifest.preferences ||
    manifest.pushSubscriptions !== 2 ||
    manifest.activeDraftsExcluded !== 0 ||
    manifest.unsentOutboundExcluded !== 0
  ) {
    throw new Error("Source user manifest differs from the approved boundary")
  }
}

function assertSafeTarget(
  target: Awaited<ReturnType<typeof inspectTarget>>,
  imported: boolean
) {
  const otherNonOwnersAreSafeTombstones =
    target.otherNonOwnerSummaries.length === target.otherNonOwners &&
    target.otherNonOwnerSummaries.every(
      (user) =>
        !user.active &&
        user.accounts === 0 &&
        user.profiles === 0 &&
        user.preferences === 0 &&
        user.pushSubscriptions === 0
    )
  const expectedSelectedUsers = imported ? 1 : target.userPresent ? 1 : 0
  if (
    target.activeOwners !== 1 ||
    !otherNonOwnersAreSafeTombstones ||
    target.nonOwners !== target.otherNonOwners + expectedSelectedUsers
  ) {
    throw new Error("Target user boundary check failed")
  }
  if (!imported) return
  if (
    !target.userPresent ||
    !target.userActive ||
    !target.passwordHashMatches ||
    target.accounts !== 2 ||
    target.credentials !== 2 ||
    target.preferences !== 1 ||
    target.pushSubscriptions !== 2 ||
    target.sessions !== 0
  ) {
    throw new Error("Imported target manifest is incomplete")
  }
}

function verifyCredentialSecrets(source: string, target: string) {
  const sourceBytes = Buffer.from(source)
  const targetBytes = Buffer.from(target)
  if (
    sourceBytes.length !== targetBytes.length ||
    !timingSafeEqual(sourceBytes, targetBytes)
  ) {
    throw new Error("Source and target credential secrets do not match")
  }
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function readOptionalProviderArg(prefix: string): Provider | undefined {
  const value = process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length)
    .trim()
  if (!value) return undefined

  const providers: Provider[] = [
    "gmail",
    "yandex",
    "mailru",
    "rambler",
    "beget",
    "custom",
  ]
  if (!providers.includes(value as Provider)) {
    throw new Error(`Unsupported provider for ${prefix}`)
  }
  return value as Provider
}

type UserRow = {
  id: number
  publicId: string
  email: string
  passwordHash: string
  displayName: string | null
  createdAt: Date
  updatedAt: Date
}
type PreferencesRow = {
  sidebarOrder: unknown
  signatures: unknown
  createdAt: Date
  updatedAt: Date
}
type Provider = "gmail" | "yandex" | "mailru" | "rambler" | "beget" | "custom"
type AccountRow = {
  id: number
  publicId: string
  emailengineAccountId: string
  provider: Provider
  address: string
  label: string | null
  displayName: string | null
  createdAt: Date
  updatedAt: Date
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUsername: string
  imapPasswordCiphertext: string
  imapPasswordIv: string
  imapPasswordTag: string
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUsername: string
  smtpPasswordCiphertext: string
  smtpPasswordIv: string
  smtpPasswordTag: string
}
type ProfileRow = {
  id: number
  publicId: string
  name: string
  createdAt: Date
  updatedAt: Date
}
type ProfileMemberRow = {
  profileId: number
  accountPublicId: string
}
type PushSubscriptionRow = {
  endpoint: string
  p256dh: string
  auth: string
  expirationTime: Date | null
  userAgent: string | null
  createdAt: Date
  updatedAt: Date
}
