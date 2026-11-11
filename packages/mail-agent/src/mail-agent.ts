import { ImapSmtpMailEngine } from "./mail-engine"
import { ConvexJwtService } from "./auth/convex-jwt"
import { MailAgentConvexClient } from "./convex/client"
import { AccountProfileService } from "./services/account-profile-service"
import { AuthService } from "./services/auth-service"
import { AccountService } from "./services/account-service"
import { ImapConnectionStartScheduler } from "./services/imap-connection-start-scheduler"
import { MailAccountRegistry } from "./services/mail-account-registry"
import { MailReadService } from "./services/mail-read-service"
import { MailIdleWatcher } from "./services/mail-idle-watcher"
import { MailProviderOperationWorker } from "./services/mail-provider-operation-worker"
import { MailSendService } from "./services/mail-send-service"
import { MailSyncWorker } from "./services/mail-sync-worker"
import { PushNotificationService } from "./services/push-notification-service"
import { UserMailPreferencesService } from "./services/user-mail-preferences-service"
import type { MailAgentConfig } from "./config"

export type MailAgent = {
  config: MailAgentConfig
  convex: MailAgentConvexClient
  convexJwt: ConvexJwtService
  auth: AuthService
  accounts: AccountService
  accountProfiles: AccountProfileService
  mail: MailReadService
  mailSender: MailSendService
  mailIdleWatcher: MailIdleWatcher
  mailProviderOperationWorker: MailProviderOperationWorker
  mailSyncWorker: MailSyncWorker
  preferences: UserMailPreferencesService
  pushNotifications: PushNotificationService
  seedOwnerUser: () => Promise<void>
  close: () => Promise<void>
}

export function createMailAgent(config: MailAgentConfig): MailAgent {
  const convex = new MailAgentConvexClient(
    config.convexUrl,
    config.convexAdminKey
  )
  const convexJwt = new ConvexJwtService({
    issuer: config.convexJwtIssuer,
    keyId: config.convexJwtKeyId,
    privateKey: config.convexJwtPrivateKey,
    publicJwk: config.convexJwtPublicJwk,
  })
  const connectionStartScheduler = new ImapConnectionStartScheduler({
    initialIntervalMs: config.mailBegetConnectionInitialIntervalSeconds * 1000,
    minIntervalMs: config.mailBegetConnectionMinIntervalSeconds * 1000,
    maxIntervalMs: config.mailBegetConnectionMaxIntervalSeconds * 1000,
  })
  const accountRegistry = new MailAccountRegistry(convex)
  const mailIdleWatcher = new MailIdleWatcher(
    convex,
    config.mailCredentialSecret,
    config.mailServerRecentMessageCacheSize,
    connectionStartScheduler,
    accountRegistry
  )
  const mailEngine = new ImapSmtpMailEngine(
    mailIdleWatcher,
    connectionStartScheduler
  )
  const auth = new AuthService(convex, config.sessionSecret)
  const accountProfiles = new AccountProfileService(convex)
  const preferences = new UserMailPreferencesService(convex)
  const pushNotifications = new PushNotificationService(convex, config)
  const mail = new MailReadService(
    convex,
    mailEngine,
    config.mailCredentialSecret,
    config.mailInitialSyncLimitPerMailbox,
    {
      connectionStartScheduler,
      recentBodyCacheSize: config.mailServerRecentBodyCacheSize,
      recentMessageCacheSize: config.mailServerRecentMessageCacheSize,
    }
  )
  const mailSender = new MailSendService(
    convex,
    mailEngine,
    config.mailCredentialSecret,
    config.appBaseUrl,
    (accountId, params) => mail.syncAccountById(accountId, params)
  )
  const mailSyncWorker = new MailSyncWorker(
    accountRegistry,
    mail,
    config.mailSyncIntervalSeconds,
    config.mailServerRecentMessageCacheSize,
    {
      fallbackInboxPollIntervalSeconds:
        config.mailFallbackInboxPollIntervalSeconds,
      realtimeSafetyPollIntervalSeconds:
        config.mailRealtimeSafetyPollIntervalSeconds,
      isRealtimeAccount: (accountId) =>
        mailIdleWatcher.isRealtimeAccount(accountId),
    }
  )
  mailIdleWatcher.setSyncAccountInbox((accountId, params) =>
    mail.syncAccountInboxAfterCurrentById(accountId, params)
  )
  mailIdleWatcher.setApplyMailboxProviderFlags(
    (accountId, mailboxPath, uid, flags, modseq) =>
      mail.applyMailboxProviderFlags(accountId, mailboxPath, uid, flags, modseq)
  )
  const mailProviderOperationWorker = new MailProviderOperationWorker(
    convex,
    mailEngine,
    config.mailCredentialSecret
  )
  const accounts = new AccountService(
    convex,
    mailEngine,
    config.mailCredentialSecret
  )

  let closing = false
  accountRegistry.start()
  mailIdleWatcher.start()
  void mailIdleWatcher.whenReady().then(() => {
    if (!closing) {
      mailSyncWorker.start()
    }
  })
  mailProviderOperationWorker.start()
  pushNotifications.start()

  return {
    config,
    convex,
    convexJwt,
    auth,
    accounts,
    accountProfiles,
    mail,
    mailSender,
    mailIdleWatcher,
    mailProviderOperationWorker,
    mailSyncWorker,
    preferences,
    pushNotifications,
    seedOwnerUser: () =>
      auth.seedOwner(config.ownerEmail, config.ownerPassword),
    close: async () => {
      closing = true
      mailSyncWorker.stop()
      await mailIdleWatcher.stop()
      accountRegistry.stop()
      mailProviderOperationWorker.stop()
      pushNotifications.stop()
      await convex.close()
    },
  }
}
