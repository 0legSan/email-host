import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

const role = v.union(v.literal("owner"), v.literal("user"))
const provider = v.union(
  v.literal("gmail"),
  v.literal("yandex"),
  v.literal("mailru"),
  v.literal("rambler"),
  v.literal("beget"),
  v.literal("custom")
)
const connectionStatus = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("auth_error"),
  v.literal("connect_error"),
  v.literal("disconnecting"),
  v.literal("disconnected")
)
const syncStatus = v.union(
  v.literal("idle"),
  v.literal("initial_sync"),
  v.literal("incremental_sync"),
  v.literal("failed"),
  v.literal("paused")
)
const bodyStatus = v.union(
  v.literal("not_loaded"),
  v.literal("loaded"),
  v.literal("failed")
)
const operationStatus = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("retry"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("superseded")
)
const mailAddress = v.object({
  address: v.string(),
  name: v.optional(v.string()),
})
const messageFlags = v.object({
  seen: v.boolean(),
  flagged: v.boolean(),
  answered: v.boolean(),
  forwarded: v.boolean(),
  draft: v.boolean(),
})

export default defineSchema({
  systemState: defineTable({
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  users: defineTable({
    publicId: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role,
    displayName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_public_id", ["publicId"])
    .index("by_email", ["email"]),

  sessions: defineTable({
    publicId: v.string(),
    userId: v.id("users"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_user", ["userId"]),

  registrationInvites: defineTable({
    publicId: v.string(),
    tokenHash: v.string(),
    createdByUserId: v.id("users"),
    acceptedByUserId: v.optional(v.id("users")),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_token_hash", ["tokenHash"]),

  passwordResetLinks: defineTable({
    publicId: v.string(),
    tokenHash: v.string(),
    userId: v.id("users"),
    createdByUserId: v.id("users"),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_token_hash", ["tokenHash"]),

  userMailPreferences: defineTable({
    userId: v.id("users"),
    sidebarOrder: v.any(),
    signatures: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    expirationTime: v.optional(v.number()),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_endpoint", ["endpoint"])
    .index("by_user", ["userId"]),

  appReleaseNotifications: defineTable({
    version: v.string(),
    notifiedAt: v.number(),
  }).index("by_version", ["version"]),

  mailAccounts: defineTable({
    publicId: v.string(),
    userId: v.id("users"),
    accountKey: v.string(),
    emailengineAccountId: v.string(),
    provider,
    address: v.string(),
    label: v.optional(v.string()),
    displayName: v.optional(v.string()),
    connectionStatus,
    syncStatus,
    lastSyncAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_public_id", ["publicId"])
    .index("by_user", ["userId"])
    .index("by_user_address_key", ["accountKey"]),

  mailAccountCredentials: defineTable({
    accountId: v.id("mailAccounts"),
    imapHost: v.string(),
    imapPort: v.number(),
    imapSecure: v.boolean(),
    imapUsername: v.string(),
    imapPasswordCiphertext: v.string(),
    imapPasswordIv: v.string(),
    imapPasswordTag: v.string(),
    smtpHost: v.string(),
    smtpPort: v.number(),
    smtpSecure: v.boolean(),
    smtpUsername: v.string(),
    smtpPasswordCiphertext: v.string(),
    smtpPasswordIv: v.string(),
    smtpPasswordTag: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_account", ["accountId"]),

  mailAccountProfiles: defineTable({
    publicId: v.string(),
    userId: v.id("users"),
    name: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_public_id", ["publicId"])
    .index("by_user", ["userId"]),

  mailAccountProfileMembers: defineTable({
    profileId: v.id("mailAccountProfiles"),
    accountId: v.id("mailAccounts"),
    profileAccountKey: v.string(),
    sortOrder: v.number(),
    createdAt: v.number(),
  })
    .index("by_profile", ["profileId"])
    .index("by_profile_order", ["profileId", "sortOrder"]),

  mailProviderErrorLogs: defineTable({
    accountId: v.optional(v.id("mailAccounts")),
    accountAddress: v.optional(v.string()),
    provider: v.optional(provider),
    mailboxPath: v.optional(v.string()),
    operation: v.string(),
    attempt: v.optional(v.number()),
    nextRetryDelayMs: v.optional(v.number()),
    errorCode: v.string(),
    errorMessage: v.string(),
    causeCode: v.optional(v.string()),
    causeName: v.optional(v.string()),
    causeMessage: v.optional(v.string()),
    causeServerResponseCode: v.optional(v.string()),
    causeResponseStatus: v.optional(v.string()),
    causeResponseText: v.optional(v.string()),
    causeMailboxMissing: v.optional(v.boolean()),
    createdAt: v.number(),
  }),

  mailboxes: defineTable({
    publicId: v.string(),
    accountId: v.id("mailAccounts"),
    mailboxKey: v.string(),
    path: v.string(),
    name: v.string(),
    specialUse: v.optional(v.string()),
    uidValidity: v.optional(v.string()),
    messagesTotal: v.optional(v.number()),
    messagesUnread: v.optional(v.number()),
    providerMessagesTotal: v.optional(v.number()),
    providerMessagesUnread: v.optional(v.number()),
    highestUid: v.optional(v.number()),
    highestModseq: v.optional(v.string()),
    liveUidCursor: v.optional(v.number()),
    liveModseqCursor: v.optional(v.string()),
    syncCursor: v.optional(v.string()),
    syncExhaustedAt: v.optional(v.number()),
    lastStatusCheckAt: v.optional(v.number()),
    lastStatusChangeAt: v.optional(v.number()),
    lastMessageSyncAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_public_id", ["publicId"])
    .index("by_account", ["accountId"])
    .index("by_account_mailbox_key", ["mailboxKey"]),

  mailThreads: defineTable({
    publicId: v.string(),
    accountId: v.id("mailAccounts"),
    accountThreadKey: v.string(),
    providerThreadId: v.optional(v.string()),
    computedThreadKey: v.string(),
    subject: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
    participants: v.array(mailAddress),
    snippet: v.optional(v.string()),
    messageCount: v.number(),
    hasAttachments: v.boolean(),
    isConversation: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_account_thread_key", ["accountThreadKey"]),

  mailMessages: defineTable({
    publicId: v.string(),
    userId: v.id("users"),
    accountId: v.id("mailAccounts"),
    threadId: v.id("mailThreads"),
    accountMessageKey: v.string(),
    accountProviderId: v.string(),
    messageKey: v.string(),
    emailengineMessageId: v.string(),
    internetMessageId: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
    references: v.array(v.string()),
    threadHeadersLoaded: v.boolean(),
    subject: v.optional(v.string()),
    from: v.optional(mailAddress),
    to: v.array(mailAddress),
    cc: v.array(mailAddress),
    bcc: v.array(mailAddress),
    sentAt: v.optional(v.number()),
    receivedAt: v.optional(v.number()),
    sortAt: v.number(),
    snippet: v.optional(v.string()),
    flags: messageFlags,
    providerFlags: messageFlags,
    flagsVersion: v.number(),
    providerFlagsVersion: v.number(),
    labels: v.array(v.string()),
    hasAttachments: v.boolean(),
    bodyStatus,
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_public_id", ["publicId"])
    .index("by_account_message_key", ["accountMessageKey"])
    .index("by_thread_received", ["threadId", "sortAt"])
    .index("by_account_received", ["accountId", "sortAt"])
    .index("by_user_received", ["userId", "sortAt"]),

  mailMessageBodies: defineTable({
    messageId: v.id("mailMessages"),
    textBody: v.optional(v.string()),
    htmlBody: v.optional(v.string()),
    textStorageId: v.optional(v.id("_storage")),
    htmlStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_message", ["messageId"]),

  mailMessageLocations: defineTable({
    messageId: v.id("mailMessages"),
    mailboxId: v.id("mailboxes"),
    mailboxUidKey: v.string(),
    uid: v.optional(v.string()),
    uidValidity: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_mailbox", ["mailboxId"])
    .index("by_mailbox_uid_key", ["mailboxUidKey"]),

  mailAttachments: defineTable({
    publicId: v.string(),
    messageId: v.id("mailMessages"),
    messagePartKey: v.string(),
    partId: v.optional(v.string()),
    emailengineAttachmentId: v.string(),
    filename: v.optional(v.string()),
    contentType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    contentId: v.optional(v.string()),
    isInline: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_message", ["messageId"])
    .index("by_message_part_key", ["messagePartKey"]),

  mailListEntries: defineTable({
    userId: v.id("users"),
    accountId: v.id("mailAccounts"),
    accountPublicId: v.optional(v.string()),
    mailboxId: v.id("mailboxes"),
    messageId: v.id("mailMessages"),
    messagePublicId: v.optional(v.string()),
    threadId: v.id("mailThreads"),
    entryKey: v.string(),
    mailboxPath: v.string(),
    mailboxSpecialUse: v.optional(v.string()),
    sortAt: v.number(),
    sentAt: v.optional(v.number()),
    subject: v.optional(v.string()),
    from: v.optional(mailAddress),
    to: v.array(mailAddress),
    snippet: v.optional(v.string()),
    seen: v.boolean(),
    flagged: v.boolean(),
    hasAttachments: v.boolean(),
    bodyStatus,
    searchText: v.string(),
    fromSearch: v.string(),
    toSearch: v.string(),
    subjectSearch: v.string(),
    visible: v.boolean(),
    openCount: v.number(),
    clickCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_entry_key", ["entryKey"])
    .index("by_user_sort", ["userId", "sortAt"])
    .index("by_user_special_use_sort", [
      "userId",
      "mailboxSpecialUse",
      "sortAt",
    ])
    .index("by_user_special_use_seen_sort", [
      "userId",
      "mailboxSpecialUse",
      "seen",
      "sortAt",
    ])
    .index("by_user_mailbox_sort", ["userId", "mailboxId", "sortAt"])
    .index("by_user_account_path_sort", [
      "userId",
      "accountId",
      "mailboxPath",
      "sortAt",
    ])
    .index("by_user_account_path_seen_sort", [
      "userId",
      "accountId",
      "mailboxPath",
      "seen",
      "sortAt",
    ])
    .index("by_user_account_special_use_sort", [
      "userId",
      "accountId",
      "mailboxSpecialUse",
      "sortAt",
    ])
    .index("by_user_account_special_use_seen_sort", [
      "userId",
      "accountId",
      "mailboxSpecialUse",
      "seen",
      "sortAt",
    ])
    .index("by_user_seen_sort", ["userId", "seen", "sortAt"])
    .index("by_user_updated", ["userId", "updatedAt"])
    .index("by_message", ["messageId"])
    .searchIndex("search_all_v2", {
      searchField: "searchText",
      filterFields: [
        "userId",
        "accountId",
        "mailboxId",
        "visible",
        "seen",
        "flagged",
        "hasAttachments",
      ],
    })
    .searchIndex("search_subject_v2", {
      searchField: "subjectSearch",
      filterFields: [
        "userId",
        "accountId",
        "mailboxId",
        "visible",
        "seen",
        "flagged",
        "hasAttachments",
      ],
    })
    .searchIndex("search_from_v2", {
      searchField: "fromSearch",
      filterFields: [
        "userId",
        "accountId",
        "mailboxId",
        "visible",
        "seen",
        "flagged",
        "hasAttachments",
      ],
    })
    .searchIndex("search_to_v2", {
      searchField: "toSearch",
      filterFields: [
        "userId",
        "accountId",
        "mailboxId",
        "visible",
        "seen",
        "flagged",
        "hasAttachments",
      ],
    }),

  mailProviderOperations: defineTable({
    publicId: v.string(),
    messageId: v.id("mailMessages"),
    accountId: v.id("mailAccounts"),
    clientMutationId: v.string(),
    messageVersionKey: v.string(),
    operation: v.union(
      v.literal("update_flags"),
      v.literal("move"),
      v.literal("delete")
    ),
    desiredFlags: v.optional(v.any()),
    destinationMailboxId: v.optional(v.id("mailboxes")),
    version: v.number(),
    status: operationStatus,
    attempts: v.number(),
    nextAttemptAt: v.number(),
    lockedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client_request", ["clientMutationId"])
    .index("by_status_attempt", ["status", "nextAttemptAt"])
    .index("by_status_locked", ["status", "lockedAt"]),

  mailDrafts: defineTable({
    publicId: v.string(),
    userId: v.id("users"),
    accountId: v.id("mailAccounts"),
    replyToMessageId: v.optional(v.id("mailMessages")),
    forwardFromMessageId: v.optional(v.id("mailMessages")),
    to: v.array(mailAddress),
    cc: v.array(mailAddress),
    bcc: v.array(mailAddress),
    subject: v.optional(v.string()),
    htmlBody: v.optional(v.string()),
    textBody: v.optional(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("discarded")
    ),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  }),

  outboundMessages: defineTable({
    publicId: v.string(),
    userId: v.id("users"),
    accountId: v.id("mailAccounts"),
    draftId: v.optional(v.id("mailDrafts")),
    userRequestKey: v.string(),
    clientRequestId: v.string(),
    emailengineQueueId: v.optional(v.string()),
    emailengineMessageId: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("submitting"),
      v.literal("sent"),
      v.literal("failed")
    ),
    payloadHash: v.string(),
    payload: v.optional(v.any()),
    trackOpens: v.boolean(),
    trackClicks: v.boolean(),
    openCount: v.number(),
    firstOpenedAt: v.optional(v.number()),
    lastOpenedAt: v.optional(v.number()),
    clickCount: v.number(),
    firstClickedAt: v.optional(v.number()),
    lastClickedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_public_id", ["publicId"])
    .index("by_user_request", ["userRequestKey"]),

  outboundClickLinks: defineTable({
    publicId: v.string(),
    outboundMessageId: v.id("outboundMessages"),
    url: v.string(),
    label: v.optional(v.string()),
    elementType: v.union(v.literal("link"), v.literal("button")),
    clickCount: v.number(),
    firstClickedAt: v.optional(v.number()),
    lastClickedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_public_id", ["publicId"]),

  providerWebhookEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    accountId: v.optional(v.id("mailAccounts")),
    payload: v.any(),
    status: v.union(
      v.literal("received"),
      v.literal("processed"),
      v.literal("failed")
    ),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    processedAt: v.optional(v.number()),
  }),

  pushEvents: defineTable({
    eventKey: v.string(),
    userId: v.id("users"),
    accountId: v.optional(v.id("mailAccounts")),
    messageId: v.optional(v.id("mailMessages")),
    type: v.union(v.literal("mail:new"), v.literal("app:update")),
    payload: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("retry"),
      v.literal("succeeded"),
      v.literal("failed")
    ),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    lockedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event_key", ["eventKey"])
    .index("by_status_attempt", ["status", "nextAttemptAt"])
    .index("by_status_locked", ["status", "lockedAt"]),
})
