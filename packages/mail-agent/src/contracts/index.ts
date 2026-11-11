import { z } from "zod"

export const publicIdSchema = z.uuid()

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
})

export type ApiError = z.infer<typeof apiErrorSchema>

export type ApiSuccess<T> = {
  ok: true
  data: T
}

export type ApiFailure = {
  ok: false
  error: ApiError
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

export const mailProviderSchema = z.enum([
  "gmail",
  "yandex",
  "mailru",
  "rambler",
  "beget",
  "custom",
])
export type MailProvider = z.infer<typeof mailProviderSchema>

export const accountConnectionStatusSchema = z.enum([
  "pending",
  "active",
  "auth_error",
  "connect_error",
  "disconnecting",
  "disconnected",
])
export type AccountConnectionStatus = z.infer<
  typeof accountConnectionStatusSchema
>

export const accountSyncStatusSchema = z.enum([
  "idle",
  "initial_sync",
  "incremental_sync",
  "failed",
  "paused",
])
export type AccountSyncStatus = z.infer<typeof accountSyncStatusSchema>

export const messageBodyStatusSchema = z.enum([
  "not_loaded",
  "loaded",
  "failed",
])
export type MessageBodyStatus = z.infer<typeof messageBodyStatusSchema>

export const draftStatusSchema = z.enum([
  "draft",
  "sending",
  "sent",
  "failed",
  "discarded",
])
export type DraftStatus = z.infer<typeof draftStatusSchema>

export const outboundStatusSchema = z.enum([
  "queued",
  "submitting",
  "sent",
  "failed",
])
export type OutboundStatus = z.infer<typeof outboundStatusSchema>

export const webhookEventStatusSchema = z.enum([
  "received",
  "processed",
  "failed",
])
export type WebhookEventStatus = z.infer<typeof webhookEventStatusSchema>

export const mailProviderOperationStatusSchema = z.enum([
  "pending",
  "processing",
  "retry",
  "succeeded",
  "failed",
  "superseded",
])
export type MailProviderOperationStatus = z.infer<
  typeof mailProviderOperationStatusSchema
>

export const mailAddressSchema = z.object({
  address: z.email(),
  name: z.string().nullable().optional(),
})
export type MailAddress = z.infer<typeof mailAddressSchema>

export const mailMessageFlagsSchema = z.object({
  seen: z.boolean().default(false),
  flagged: z.boolean().default(false),
  answered: z.boolean().default(false),
  forwarded: z.boolean().default(false),
  draft: z.boolean().default(false),
})
export type MailMessageFlags = z.infer<typeof mailMessageFlagsSchema>

export const userRoleSchema = z.enum(["owner", "user"])
export type UserRole = z.infer<typeof userRoleSchema>

export const userDtoSchema = z.object({
  id: publicIdSchema,
  email: z.email(),
  role: userRoleSchema,
  displayName: z.string().nullable(),
})
export type UserDto = z.infer<typeof userDtoSchema>

export const managedUserDtoSchema = userDtoSchema.extend({
  createdAt: z.string(),
  deactivatedAt: z.string().nullable(),
})
export type ManagedUserDto = z.infer<typeof managedUserDtoSchema>

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})
export type LoginRequest = z.infer<typeof loginRequestSchema>

export const registrationInviteTokenSchema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/)

export const createRegistrationInviteRequestSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7),
})
export type CreateRegistrationInviteRequest = z.infer<
  typeof createRegistrationInviteRequestSchema
>

export const registrationInvitePublicDtoSchema = z.object({
  expiresAt: z.string(),
})
export type RegistrationInvitePublicDto = z.infer<
  typeof registrationInvitePublicDtoSchema
>

export const registrationInviteCreatedDtoSchema =
  registrationInvitePublicDtoSchema.extend({
    token: registrationInviteTokenSchema,
  })
export type RegistrationInviteCreatedDto = z.infer<
  typeof registrationInviteCreatedDtoSchema
>

export const registerWithInviteRequestSchema = z.object({
  token: registrationInviteTokenSchema,
  email: z.email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(1).max(120).optional(),
})
export type RegisterWithInviteRequest = z.infer<
  typeof registerWithInviteRequestSchema
>

export const createRegistrationInviteResponseSchema = z.object({
  invite: registrationInviteCreatedDtoSchema,
})
export type CreateRegistrationInviteResponse = z.infer<
  typeof createRegistrationInviteResponseSchema
>

export const getRegistrationInviteResponseSchema = z.object({
  invite: registrationInvitePublicDtoSchema,
})
export type GetRegistrationInviteResponse = z.infer<
  typeof getRegistrationInviteResponseSchema
>

export const passwordResetTokenSchema = registrationInviteTokenSchema

export const createPasswordResetLinkRequestSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).default(7),
})
export type CreatePasswordResetLinkRequest = z.infer<
  typeof createPasswordResetLinkRequestSchema
>

export const passwordResetLinkPublicDtoSchema = z.object({
  expiresAt: z.string(),
})
export type PasswordResetLinkPublicDto = z.infer<
  typeof passwordResetLinkPublicDtoSchema
>

export const passwordResetLinkCreatedDtoSchema =
  passwordResetLinkPublicDtoSchema.extend({
    token: passwordResetTokenSchema,
  })
export type PasswordResetLinkCreatedDto = z.infer<
  typeof passwordResetLinkCreatedDtoSchema
>

export const resetPasswordRequestSchema = z.object({
  token: passwordResetTokenSchema,
  password: z.string().min(8),
})
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>

export const listManagedUsersResponseSchema = z.object({
  users: z.array(managedUserDtoSchema),
})
export type ListManagedUsersResponse = z.infer<
  typeof listManagedUsersResponseSchema
>

export const deactivateManagedUserResponseSchema = z.object({
  user: managedUserDtoSchema,
})
export type DeactivateManagedUserResponse = z.infer<
  typeof deactivateManagedUserResponseSchema
>

export const createPasswordResetLinkResponseSchema = z.object({
  link: passwordResetLinkCreatedDtoSchema,
  user: managedUserDtoSchema,
})
export type CreatePasswordResetLinkResponse = z.infer<
  typeof createPasswordResetLinkResponseSchema
>

export const getPasswordResetLinkResponseSchema = z.object({
  link: passwordResetLinkPublicDtoSchema,
})
export type GetPasswordResetLinkResponse = z.infer<
  typeof getPasswordResetLinkResponseSchema
>

export const resetPasswordResponseSchema = z.object({
  user: userDtoSchema,
})
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>

export const loginResponseSchema = z.object({
  user: userDtoSchema,
})
export type LoginResponse = z.infer<typeof loginResponseSchema>

export const meResponseSchema = z.object({
  user: userDtoSchema,
})
export type MeResponse = z.infer<typeof meResponseSchema>

export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})
export type PushSubscriptionDto = z.infer<typeof pushSubscriptionSchema>

export const savePushSubscriptionRequestSchema = z.object({
  subscription: pushSubscriptionSchema,
})
export type SavePushSubscriptionRequest = z.infer<
  typeof savePushSubscriptionRequestSchema
>

export const deletePushSubscriptionRequestSchema = z.object({
  endpoint: z.url(),
})
export type DeletePushSubscriptionRequest = z.infer<
  typeof deletePushSubscriptionRequestSchema
>

export const pushVapidPublicKeyResponseSchema = z.object({
  publicKey: z.string().min(1),
})
export type PushVapidPublicKeyResponse = z.infer<
  typeof pushVapidPublicKeyResponseSchema
>

export const pushTestResponseSchema = z.object({
  sent: z.number().int().nonnegative(),
})
export type PushTestResponse = z.infer<typeof pushTestResponseSchema>

export const mailAccountDtoSchema = z.object({
  id: publicIdSchema,
  provider: mailProviderSchema,
  address: z.email(),
  label: z.string().nullable(),
  displayName: z.string().nullable(),
  connectionStatus: accountConnectionStatusSchema,
  syncStatus: accountSyncStatusSchema,
  lastSyncAt: z.string().nullable(),
  lastError: z.string().nullable(),
})
export type MailAccountDto = z.infer<typeof mailAccountDtoSchema>

export const mailAccountProfileDtoSchema = z.object({
  id: publicIdSchema,
  name: z.string(),
  accountIds: z.array(publicIdSchema),
})
export type MailAccountProfileDto = z.infer<typeof mailAccountProfileDtoSchema>

export const mailSidebarOrderItemSchema = z.object({
  type: z.enum(["account", "profile"]),
  id: publicIdSchema,
})
export type MailSidebarOrderItem = z.infer<typeof mailSidebarOrderItemSchema>

export const mailSignatureDtoSchema = z.object({
  id: publicIdSchema,
  accountId: publicIdSchema.nullable().optional(),
  name: z.string(),
  html: z.string(),
  updatedAt: z.string().nullable(),
})
export type MailSignatureDto = z.infer<typeof mailSignatureDtoSchema>

export const mailSignatureComposeModeSchema = z.enum([
  "new",
  "reply",
  "forward",
])
export type MailSignatureComposeMode = z.infer<
  typeof mailSignatureComposeModeSchema
>

export const mailSignatureDefaultsSchema = z.object({
  new: publicIdSchema.nullable(),
  reply: publicIdSchema.nullable(),
  forward: publicIdSchema.nullable(),
})
export type MailSignatureDefaults = z.infer<typeof mailSignatureDefaultsSchema>

export const mailSignatureAccountDefaultsSchema = z.object({
  new: publicIdSchema.nullable().optional(),
  reply: publicIdSchema.nullable().optional(),
  forward: publicIdSchema.nullable().optional(),
})
export type MailSignatureAccountDefaults = z.infer<
  typeof mailSignatureAccountDefaultsSchema
>

export const mailSignaturesPreferencesSchema = z.object({
  defaultId: publicIdSchema.nullable(),
  defaults: z.object({
    global: mailSignatureDefaultsSchema,
    accounts: z.record(publicIdSchema, mailSignatureAccountDefaultsSchema),
  }),
  items: z.array(mailSignatureDtoSchema),
})
export type MailSignaturesPreferences = z.infer<
  typeof mailSignaturesPreferencesSchema
>

export const mailPreferencesDtoSchema = z.object({
  sidebar: z.object({
    order: z.array(mailSidebarOrderItemSchema),
  }),
  signatures: mailSignaturesPreferencesSchema,
})
export type MailPreferencesDto = z.infer<typeof mailPreferencesDtoSchema>

export const updateMailSidebarOrderRequestSchema = z.object({
  order: z.array(mailSidebarOrderItemSchema).max(500),
})
export type UpdateMailSidebarOrderRequest = z.infer<
  typeof updateMailSidebarOrderRequestSchema
>

export const upsertMailSignatureRequestSchema = z.object({
  accountId: publicIdSchema.nullable().optional(),
  id: publicIdSchema.optional(),
  name: z.string().trim().min(1).max(120).default("Основная подпись"),
  html: z.string().max(100_000),
  defaultFor: z
    .object({
      accountId: publicIdSchema.nullable().optional(),
      modes: z.array(mailSignatureComposeModeSchema).min(1).max(3),
    })
    .optional(),
  makeDefault: z.boolean().optional(),
})
export type UpsertMailSignatureRequest = z.infer<
  typeof upsertMailSignatureRequestSchema
>

export const updateMailSignatureDefaultsRequestSchema = z.object({
  accountId: publicIdSchema.nullable().optional(),
  defaults: mailSignatureAccountDefaultsSchema,
})
export type UpdateMailSignatureDefaultsRequest = z.infer<
  typeof updateMailSignatureDefaultsRequestSchema
>

export const createMailAccountProfileRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  accountIds: z.array(publicIdSchema).default([]),
})
export type CreateMailAccountProfileRequest = z.infer<
  typeof createMailAccountProfileRequestSchema
>

export const updateMailAccountProfileRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  accountIds: z.array(publicIdSchema).optional(),
})
export type UpdateMailAccountProfileRequest = z.infer<
  typeof updateMailAccountProfileRequestSchema
>

export const mailConnectionSettingsSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  secure: z.boolean(),
  username: z.string().min(1),
  password: z.string().min(1),
})
export type MailConnectionSettings = z.infer<
  typeof mailConnectionSettingsSchema
>

export const connectImapAccountRequestSchema = z.object({
  provider: mailProviderSchema,
  address: z.email(),
  displayName: z.string().optional(),
  imap: mailConnectionSettingsSchema,
  smtp: mailConnectionSettingsSchema,
})
export type ConnectImapAccountRequest = z.infer<
  typeof connectImapAccountRequestSchema
>

export const reconnectImapAccountRequestSchema = z.object({
  provider: mailProviderSchema.optional(),
  displayName: z.string().optional(),
  imap: mailConnectionSettingsSchema,
  smtp: mailConnectionSettingsSchema,
})
export type ReconnectImapAccountRequest = z.infer<
  typeof reconnectImapAccountRequestSchema
>

export const updateMailAccountRequestSchema = z.object({
  label: z.string().optional(),
})
export type UpdateMailAccountRequest = z.infer<
  typeof updateMailAccountRequestSchema
>

export const connectAccountResponseSchema = z.object({
  account: mailAccountDtoSchema,
})
export type ConnectAccountResponse = z.infer<
  typeof connectAccountResponseSchema
>

export const listAccountsResponseSchema = z.object({
  accounts: z.array(mailAccountDtoSchema),
})
export type ListAccountsResponse = z.infer<typeof listAccountsResponseSchema>

export const listMailAccountProfilesResponseSchema = z.object({
  profiles: z.array(mailAccountProfileDtoSchema),
})
export type ListMailAccountProfilesResponse = z.infer<
  typeof listMailAccountProfilesResponseSchema
>

export const mailAccountProfileResponseSchema = z.object({
  profile: mailAccountProfileDtoSchema,
})
export type MailAccountProfileResponse = z.infer<
  typeof mailAccountProfileResponseSchema
>

export const liveMailboxDtoSchema = z.object({
  path: z.string(),
  name: z.string(),
  specialUse: z.string().nullable(),
  messagesTotal: z.number().int().nullable(),
  messagesUnread: z.number().int().nullable(),
  searchComplete: z.boolean(),
})
export type LiveMailboxDto = z.infer<typeof liveMailboxDtoSchema>

export const liveMessageListItemDtoSchema = z.object({
  id: z.string(),
  accountId: publicIdSchema.nullable(),
  path: z.string().nullable(),
  subject: z.string().nullable(),
  from: mailAddressSchema.nullable(),
  to: z.array(mailAddressSchema),
  sentAt: z.string().nullable(),
  snippet: z.string().nullable(),
  seen: z.boolean(),
  flagged: z.boolean(),
  hasAttachments: z.boolean(),
  sizeBytes: z.number().int().nullable(),
  openTracking: z
    .object({
      enabled: z.boolean(),
      openCount: z.number().int().nonnegative(),
      firstOpenedAt: z.string().nullable(),
      lastOpenedAt: z.string().nullable(),
    })
    .nullable(),
  clickTracking: z
    .object({
      enabled: z.boolean(),
      clickCount: z.number().int().nonnegative(),
      firstClickedAt: z.string().nullable(),
      lastClickedAt: z.string().nullable(),
    })
    .nullable(),
})
export type LiveMessageListItemDto = z.infer<
  typeof liveMessageListItemDtoSchema
>

export const mailAttachmentDtoSchema = z.object({
  id: publicIdSchema,
  filename: z.string().nullable(),
  contentType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  contentId: z.string().nullable(),
  isInline: z.boolean(),
})
export type MailAttachmentDto = z.infer<typeof mailAttachmentDtoSchema>

export const liveMessageDtoSchema = liveMessageListItemDtoSchema.extend({
  bodyStatus: messageBodyStatusSchema,
  text: z.string().nullable(),
  html: z.string().nullable(),
  attachments: z.array(mailAttachmentDtoSchema),
})
export type LiveMessageDto = z.infer<typeof liveMessageDtoSchema>

export const mailMessageThreadItemDtoSchema =
  liveMessageListItemDtoSchema.extend({
    mailboxName: z.string().nullable(),
    mailboxSpecialUse: z.string().nullable(),
    isDraft: z.boolean(),
  })
export type MailMessageThreadItemDto = z.infer<
  typeof mailMessageThreadItemDtoSchema
>

export const mailMessageThreadDtoSchema = z.object({
  id: publicIdSchema,
  accountId: publicIdSchema,
  subject: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  messages: z.array(mailMessageThreadItemDtoSchema),
})
export type MailMessageThreadDto = z.infer<typeof mailMessageThreadDtoSchema>

export const listLiveMailboxesResponseSchema = z.object({
  mailboxes: z.array(liveMailboxDtoSchema),
})
export type ListLiveMailboxesResponse = z.infer<
  typeof listLiveMailboxesResponseSchema
>

export const listLiveMessagesResponseSchema = z.object({
  total: z.number().int().nullable(),
  nextPageCursor: z.string().nullable(),
  messages: z.array(liveMessageListItemDtoSchema),
})
export type ListLiveMessagesResponse = z.infer<
  typeof listLiveMessagesResponseSchema
>

export const getLiveMessageResponseSchema = z.object({
  message: liveMessageDtoSchema,
})
export type GetLiveMessageResponse = z.infer<
  typeof getLiveMessageResponseSchema
>

export const getMailMessageThreadResponseSchema = z.object({
  thread: mailMessageThreadDtoSchema,
})
export type GetMailMessageThreadResponse = z.infer<
  typeof getMailMessageThreadResponseSchema
>

export const listStoredMessagesResponseSchema = z.object({
  total: z.number().int().nullable(),
  nextPageCursor: z.string().nullable(),
  messages: z.array(liveMessageListItemDtoSchema),
})
export type ListStoredMessagesResponse = z.infer<
  typeof listStoredMessagesResponseSchema
>

export const mailboxDtoSchema = z.object({
  id: publicIdSchema,
  accountId: publicIdSchema,
  path: z.string(),
  name: z.string(),
  specialUse: z.string().nullable(),
  messagesTotal: z.number().int().nullable(),
  messagesUnread: z.number().int().nullable(),
})
export type MailboxDto = z.infer<typeof mailboxDtoSchema>

export const mailThreadListItemDtoSchema = z.object({
  id: publicIdSchema,
  accountId: publicIdSchema,
  subject: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  participants: z.array(mailAddressSchema),
  snippet: z.string().nullable(),
  messageCount: z.number().int().nonnegative(),
  hasAttachments: z.boolean(),
})
export type MailThreadListItemDto = z.infer<typeof mailThreadListItemDtoSchema>

export const mailThreadDtoSchema = mailThreadListItemDtoSchema.extend({
  providerThreadId: z.string().nullable(),
})
export type MailThreadDto = z.infer<typeof mailThreadDtoSchema>

export const mailMessageDtoSchema = z.object({
  id: publicIdSchema,
  accountId: publicIdSchema,
  threadId: publicIdSchema,
  subject: z.string().nullable(),
  from: mailAddressSchema.nullable(),
  to: z.array(mailAddressSchema),
  cc: z.array(mailAddressSchema),
  bcc: z.array(mailAddressSchema),
  sentAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
  snippet: z.string().nullable(),
  flags: mailMessageFlagsSchema,
  labels: z.array(z.string()),
  hasAttachments: z.boolean(),
  attachments: z.array(mailAttachmentDtoSchema),
  bodyStatus: messageBodyStatusSchema,
})
export type MailMessageDto = z.infer<typeof mailMessageDtoSchema>

export const messageBodyResponseSchema = z.object({
  messageId: publicIdSchema,
  text: z.string().nullable(),
  html: z.string().nullable(),
})
export type MessageBodyResponse = z.infer<typeof messageBodyResponseSchema>

export const outboundMessageDtoSchema = z.object({
  id: publicIdSchema,
  accountId: publicIdSchema,
  clientRequestId: z.string(),
  status: outboundStatusSchema,
  trackOpens: z.boolean(),
  trackClicks: z.boolean(),
  openCount: z.number().int().nonnegative(),
  firstOpenedAt: z.string().nullable(),
  lastOpenedAt: z.string().nullable(),
  clickCount: z.number().int().nonnegative(),
  firstClickedAt: z.string().nullable(),
  lastClickedAt: z.string().nullable(),
  lastError: z.string().nullable(),
})
export type OutboundMessageDto = z.infer<typeof outboundMessageDtoSchema>

export const sendMessageRequestSchema = z.object({
  clientRequestId: z.string().min(1),
  accountId: publicIdSchema,
  draftId: publicIdSchema.optional(),
  referenceMessageId: publicIdSchema.optional(),
  mode: z.enum(["new", "reply", "forward"]).default("new").optional(),
  to: z.array(mailAddressSchema).min(1),
  cc: z.array(mailAddressSchema).optional(),
  bcc: z.array(mailAddressSchema).optional(),
  subject: z.string(),
  html: z.string().optional(),
  text: z.string().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().nullable().optional(),
        contentType: z.string().nullable().optional(),
        content: z.string().min(1),
      })
    )
    .optional(),
  trackOpens: z.boolean().optional(),
  trackClicks: z.boolean().optional(),
})
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>

export const mailMessageFlagsPatchSchema = z.object({
  seen: z.boolean().optional(),
  flagged: z.boolean().optional(),
})
export type MailMessageFlagsPatch = z.infer<typeof mailMessageFlagsPatchSchema>

export const updateMessageRequestSchema = mailMessageFlagsPatchSchema.extend({
  clientMutationId: z.uuid().optional(),
})
export type UpdateMessageRequest = z.infer<typeof updateMessageRequestSchema>

export const moveMessageRequestSchema = z.object({
  path: z.string().min(1),
})
export type MoveMessageRequest = z.infer<typeof moveMessageRequestSchema>
