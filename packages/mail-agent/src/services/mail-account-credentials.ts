import { internal } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { decryptCredential } from "../credentials/credential-encryption"
import type { MailAgentConvexClient } from "../convex/client"
import type { MailEngineCredentials } from "../mail-engine"

export async function findMailAccountCredentials(
  convex: MailAgentConvexClient,
  accountId: Id<"mailAccounts">,
  mailCredentialSecret: string
): Promise<MailEngineCredentials | null> {
  const credentials = await convex.query(
    internal.accountsInternal.getCredentials,
    { accountId }
  )

  if (!credentials) {
    return null
  }

  return {
    accountId,
    imap: {
      host: credentials.imapHost,
      port: credentials.imapPort,
      secure: credentials.imapSecure,
      username: credentials.imapUsername,
      password: decryptCredential(
        {
          ciphertext: credentials.imapPasswordCiphertext,
          iv: credentials.imapPasswordIv,
          tag: credentials.imapPasswordTag,
        },
        mailCredentialSecret
      ),
    },
    smtp: {
      host: credentials.smtpHost,
      port: credentials.smtpPort,
      secure: credentials.smtpSecure,
      username: credentials.smtpUsername,
      password: decryptCredential(
        {
          ciphertext: credentials.smtpPasswordCiphertext,
          iv: credentials.smtpPasswordIv,
          tag: credentials.smtpPasswordTag,
        },
        mailCredentialSecret
      ),
    },
  }
}
