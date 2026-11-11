import { timingSafeEqual } from "node:crypto"

import { Client } from "pg"

import { internal } from "../convex/_generated/api"
import { MailAgentConvexClient } from "../packages/mail-agent/src/convex/client"

const apply = process.argv.includes("--apply")
const sourceDatabaseUrl = requireEnv("SOURCE_DATABASE_URL")
verifyCredentialSecrets(
  requireEnv("SOURCE_MAIL_CREDENTIAL_SECRET"),
  requireEnv("MAIL_CREDENTIAL_SECRET")
)

const source = new Client({
  connectionString: sourceDatabaseUrl,
  application_name: "email-host-convex-owner-migration",
})

await source.connect()
try {
  await source.query("begin transaction read only")
  const bundle = await readOwnerBundle(source)
  await source.query("rollback")

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        owner: {
          publicId: bundle.owner.publicId,
          email: bundle.owner.email,
        },
        accounts: bundle.accounts.length,
        profiles: bundle.profiles.length,
        preferences: bundle.preferences !== undefined,
        excludedUsers: bundle.excludedUsers,
        excludedIqbrikUsers: bundle.excludedIqbrikUsers,
        importedMessages: 0,
        importedPushSubscriptions: 0,
      },
      null,
      2
    )
  )

  if (apply) {
    const convex = createConvexClient(
      requireEnv("CONVEX_SELF_HOSTED_URL"),
      requireEnv("CONVEX_SELF_HOSTED_ADMIN_KEY")
    )
    const result = await convex.mutation(
      internal.migrationInternal.importOwnerBundle,
      {
        owner: bundle.owner,
        preferences: bundle.preferences,
        accounts: bundle.accounts,
        profiles: bundle.profiles,
      }
    )
    const target = await convex.query(
      internal.migrationInternal.inspectTarget,
      {}
    )
    if (
      target.activeOwners !== 1 ||
      target.nonOwners !== 0 ||
      target.messages !== 0 ||
      target.mailboxes !== 0 ||
      target.pushSubscriptions !== 0
    ) {
      throw new Error(
        "Target contains data outside the owner-only migration boundary"
      )
    }
    console.log(
      JSON.stringify(
        {
          applied: result,
          target,
        },
        null,
        2
      )
    )
  }
} finally {
  await source.end()
}

async function readOwnerBundle(client: Client) {
  const owners = await client.query<OwnerRow>(`
    select
      id,
      public_id as "publicId",
      email,
      password_hash as "passwordHash",
      display_name as "displayName",
      created_at as "createdAt",
      updated_at as "updatedAt"
    from users
    where role = 'owner' and deleted_at is null
    order by id
  `)
  if (owners.rows.length !== 1) {
    throw new Error(
      `Expected exactly one active owner, found ${owners.rows.length}`
    )
  }
  const owner = owners.rows[0]!
  const [excluded, iqbrik, preferences, accounts, profiles, members] =
    await Promise.all([
      client.query<{ count: string }>(
        "select count(*)::text as count from users where id <> $1",
        [owner.id]
      ),
      client.query<{ count: string }>(
        `select count(*)::text as count
         from users
         where id <> $1
           and (
             lower(email) like '%iqbrik%'
             or lower(coalesce(display_name, '')) like '%iqbrik%'
           )`,
        [owner.id]
      ),
      client.query<PreferencesRow>(
        `select
           sidebar_order as "sidebarOrder",
           signatures,
           created_at as "createdAt",
           updated_at as "updatedAt"
         from user_mail_preferences
         where user_id = $1`,
        [owner.id]
      ),
      client.query<AccountRow>(
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
         join mail_account_credentials credential
           on credential.account_id = account.id
         where account.user_id = $1 and account.deleted_at is null
         order by account.id`,
        [owner.id]
      ),
      client.query<ProfileRow>(
        `select
           id,
           public_id as "publicId",
           name,
           created_at as "createdAt",
           updated_at as "updatedAt"
         from mail_account_profiles
         where user_id = $1 and deleted_at is null
         order by id`,
        [owner.id]
      ),
      client.query<ProfileMemberRow>(
        `select
           member.profile_id as "profileId",
           account.public_id as "accountPublicId"
         from mail_account_profile_members member
         join mail_account_profiles profile on profile.id = member.profile_id
         join mail_accounts account on account.id = member.account_id
         where profile.user_id = $1
           and profile.deleted_at is null
           and account.user_id = $1
           and account.deleted_at is null
         order by member.profile_id, member.sort_order`,
        [owner.id]
      ),
    ])

  const membersByProfile = new Map<number, string[]>()
  for (const member of members.rows) {
    const accountIds = membersByProfile.get(member.profileId) ?? []
    accountIds.push(member.accountPublicId)
    membersByProfile.set(member.profileId, accountIds)
  }

  return {
    owner: {
      publicId: owner.publicId,
      email: owner.email.toLocaleLowerCase(),
      passwordHash: owner.passwordHash,
      displayName: owner.displayName ?? undefined,
      createdAt: owner.createdAt.getTime(),
      updatedAt: owner.updatedAt.getTime(),
    },
    preferences: preferences.rows[0]
      ? {
          sidebarOrder: preferences.rows[0].sidebarOrder,
          signatures: preferences.rows[0].signatures,
          createdAt: preferences.rows[0].createdAt.getTime(),
          updatedAt: preferences.rows[0].updatedAt.getTime(),
        }
      : undefined,
    accounts: accounts.rows.map((account) => ({
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
    })),
    profiles: profiles.rows.map((profile) => ({
      publicId: profile.publicId,
      name: profile.name,
      accountPublicIds: membersByProfile.get(profile.id) ?? [],
      createdAt: profile.createdAt.getTime(),
      updatedAt: profile.updatedAt.getTime(),
    })),
    excludedUsers: Number(excluded.rows[0]?.count ?? 0),
    excludedIqbrikUsers: Number(iqbrik.rows[0]?.count ?? 0),
  }
}

function createConvexClient(url: string, adminKey: string) {
  return new MailAgentConvexClient(url, adminKey)
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

type OwnerRow = {
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
