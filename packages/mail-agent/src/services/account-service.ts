import { randomUUID } from "node:crypto"

import type { Doc, Id } from "../../../../convex/_generated/dataModel"
import { internal } from "../../../../convex/_generated/api"
import type {
  ConnectImapAccountRequest,
  MailAccountDto,
  ReconnectImapAccountRequest,
  UpdateMailAccountRequest,
} from "../contracts"
import { encryptCredential } from "../credentials/credential-encryption"
import type { MailAgentConvexClient } from "../convex/client"
import type { MailEngine, MailEngineCredentials } from "../mail-engine"

export class AccountService {
  private readonly convex: MailAgentConvexClient
  private readonly mailEngine: MailEngine
  private readonly mailCredentialSecret: string

  constructor(
    convex: MailAgentConvexClient,
    mailEngine: MailEngine,
    mailCredentialSecret: string
  ) {
    this.convex = convex
    this.mailEngine = mailEngine
    this.mailCredentialSecret = mailCredentialSecret
  }

  async listAccounts(userId: Id<"users">): Promise<MailAccountDto[]> {
    const rows = await this.convex.query(internal.accountsInternal.list, {
      userId,
    })
    return rows
      .map(({ account, hasCredentials }) =>
        toMailAccountDto(account, hasCredentials)
      )
      .sort((first, second) => first.address.localeCompare(second.address))
  }

  async connectImapAccount(
    userId: Id<"users">,
    request: ConnectImapAccountRequest
  ): Promise<MailAccountDto> {
    const address = request.address.toLowerCase()
    const existing = (
      await this.convex.query(internal.accountsInternal.list, { userId })
    ).find((row) => row.account.address === address)

    if (
      existing?.hasCredentials &&
      existing.account.connectionStatus === "active"
    ) {
      return toMailAccountDto(existing.account, true)
    }

    await this.mailEngine.validateAccountConnection(
      toMailEngineCredentials(request)
    )
    const account = await this.convex.mutation(
      internal.accountsInternal.connect,
      {
        userId,
        publicId: randomUUID(),
        emailengineAccountId: createLocalAccountId(),
        provider: request.provider,
        address,
        displayName: normalizeDisplayName(request.displayName) ?? undefined,
        credentials: this.createEncryptedCredentialValues(request),
      }
    )

    if (!account) {
      throw new Error("Convex did not return the connected account")
    }

    return toMailAccountDto(account, true)
  }

  async reconnect(
    userId: Id<"users">,
    accountPublicId: string,
    request: ReconnectImapAccountRequest
  ): Promise<MailAccountDto | null> {
    await this.mailEngine.validateAccountConnection(
      toMailEngineCredentials(request)
    )
    const account = await this.convex.mutation(
      internal.accountsInternal.reconnect,
      {
        userId,
        publicId: accountPublicId,
        provider: request.provider,
        displayName: normalizeDisplayName(request.displayName) ?? undefined,
        credentials: this.createEncryptedCredentialValues(request),
      }
    )

    return account ? toMailAccountDto(account, true) : null
  }

  async requestSync(
    userId: Id<"users">,
    accountPublicId: string
  ): Promise<MailAccountDto | null> {
    const account = await this.convex.mutation(
      internal.accountsInternal.requestSync,
      {
        userId,
        publicId: accountPublicId,
      }
    )
    return account ? toMailAccountDto(account) : null
  }

  async updateAccount(
    userId: Id<"users">,
    accountPublicId: string,
    request: UpdateMailAccountRequest
  ): Promise<MailAccountDto | null> {
    const account = await this.convex.mutation(
      internal.accountsInternal.update,
      {
        userId,
        publicId: accountPublicId,
        label: normalizeLabel(request.label) ?? undefined,
      }
    )
    return account ? toMailAccountDto(account) : null
  }

  async deleteAccount(
    userId: Id<"users">,
    accountPublicId: string
  ): Promise<boolean> {
    const deleted = await this.convex.mutation(
      internal.accountsInternal.remove,
      {
        userId,
        publicId: accountPublicId,
      }
    )
    return deleted
  }

  private createEncryptedCredentialValues(
    request: Pick<ConnectImapAccountRequest, "imap" | "smtp">
  ) {
    const imapPassword = encryptCredential(
      request.imap.password,
      this.mailCredentialSecret
    )
    const smtpPassword = encryptCredential(
      request.smtp.password,
      this.mailCredentialSecret
    )

    return {
      imapHost: request.imap.host,
      imapPort: request.imap.port,
      imapSecure: request.imap.secure,
      imapUsername: request.imap.username,
      imapPasswordCiphertext: imapPassword.ciphertext,
      imapPasswordIv: imapPassword.iv,
      imapPasswordTag: imapPassword.tag,
      smtpHost: request.smtp.host,
      smtpPort: request.smtp.port,
      smtpSecure: request.smtp.secure,
      smtpUsername: request.smtp.username,
      smtpPasswordCiphertext: smtpPassword.ciphertext,
      smtpPasswordIv: smtpPassword.iv,
      smtpPasswordTag: smtpPassword.tag,
    }
  }
}

export function toMailAccountDto(
  account: Doc<"mailAccounts">,
  hasLocalCredentials = true
): MailAccountDto {
  return {
    id: account.publicId,
    provider: account.provider,
    address: account.address,
    label: account.label ?? null,
    displayName: account.displayName ?? null,
    connectionStatus: hasLocalCredentials
      ? account.connectionStatus
      : "connect_error",
    syncStatus: hasLocalCredentials ? account.syncStatus : "paused",
    lastSyncAt:
      account.lastSyncAt === undefined
        ? null
        : new Date(account.lastSyncAt).toISOString(),
    lastError: account.lastError ?? null,
  }
}

function toMailEngineCredentials(
  request: Pick<ConnectImapAccountRequest, "imap" | "smtp">
): MailEngineCredentials {
  return {
    imap: request.imap,
    smtp: request.smtp,
  }
}

function createLocalAccountId() {
  return `local_${randomUUID()}`
}

function normalizeDisplayName(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function normalizeLabel(value: string | undefined | null) {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}
