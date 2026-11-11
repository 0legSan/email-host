import { randomUUID } from "node:crypto"

import type { Id } from "../../../../convex/_generated/dataModel"
import { internal } from "../../../../convex/_generated/api"
import type {
  MailSignatureAccountDefaults,
  MailSignatureComposeMode,
  MailSignatureDefaults,
  MailPreferencesDto,
  MailSignatureDto,
  MailSignaturesPreferences,
  MailSidebarOrderItem,
  UpdateMailSignatureDefaultsRequest,
  UpsertMailSignatureRequest,
} from "../contracts"
import type { MailAgentConvexClient } from "../convex/client"

export class InvalidSidebarOrderError extends Error {
  constructor() {
    super("Invalid sidebar order")
  }
}

export class InvalidSignatureDefaultsError extends Error {
  constructor() {
    super("Invalid signature defaults")
  }
}

const signatureComposeModes: MailSignatureComposeMode[] = [
  "new",
  "reply",
  "forward",
]

export class UserMailPreferencesService {
  private readonly convex: MailAgentConvexClient

  constructor(convex: MailAgentConvexClient) {
    this.convex = convex
  }

  async getPreferences(userId: Id<"users">): Promise<MailPreferencesDto> {
    const state = await this.getState(userId)
    const signatures = this.ensureAccountSignatures(
      normalizeSignatures(state.preferences.signatures),
      state.ownership.accounts
    )

    if (signatures.changed) {
      await this.save(
        userId,
        state.preferences.sidebarOrder,
        signatures.value
      )
    }

    return toPreferencesDto(
      state.preferences.sidebarOrder,
      signatures.value
    )
  }

  async updateSidebarOrder(
    userId: Id<"users">,
    order: MailSidebarOrderItem[]
  ): Promise<MailPreferencesDto> {
    const state = await this.getState(userId)
    const normalizedOrder = this.normalizeSidebarOrder(
      order,
      state.ownership
    )
    const signatures = normalizeSignatures(state.preferences.signatures)
    await this.save(userId, normalizedOrder, signatures)
    return toPreferencesDto(normalizedOrder, signatures)
  }

  async upsertSignature(
    userId: Id<"users">,
    request: UpsertMailSignatureRequest
  ): Promise<MailPreferencesDto> {
    const state = await this.getState(userId)
    const currentSignatures = normalizeSignatures(
      state.preferences.signatures
    )
    const currentSignature = currentSignatures.items.find(
      (signature) => signature.id === request.id
    )
    const accountId =
      request.accountId !== undefined
        ? request.accountId
        : (request.defaultFor?.accountId ?? currentSignature?.accountId ?? null)

    if (accountId) {
      this.validateSignatureAccount(state.ownership.accounts, accountId)
    }

    const id = request.id ?? randomUUID()
    const updatedSignature: MailSignatureDto = {
      accountId,
      id,
      name: request.name,
      html: request.html,
      updatedAt: new Date().toISOString(),
    }
    const items = [
      updatedSignature,
      ...currentSignatures.items.filter((signature) => signature.id !== id),
    ]
    let signatures: MailSignaturesPreferences = {
      ...currentSignatures,
      items,
    }

    if (request.defaultFor) {
      this.validateSignatureDefaultScope(
        state.ownership.accounts,
        request.defaultFor
      )
      signatures = applySignatureDefaultModes(
        signatures,
        request.defaultFor.accountId ?? null,
        request.defaultFor.modes,
        id
      )
    } else if (request.makeDefault !== false) {
      signatures = applySignatureDefaultModes(
        signatures,
        null,
        signatureComposeModes,
        id
      )
    }

    await this.save(userId, state.preferences.sidebarOrder, signatures)
    return toPreferencesDto(state.preferences.sidebarOrder, signatures)
  }

  async updateSignatureDefaults(
    userId: Id<"users">,
    request: UpdateMailSignatureDefaultsRequest
  ): Promise<MailPreferencesDto> {
    const state = await this.getState(userId)
    this.validateSignatureDefaultScope(state.ownership.accounts, {
      accountId: request.accountId,
      modes: signatureComposeModes,
    })

    const currentSignatures = normalizeSignatures(
      state.preferences.signatures
    )
    const signatures = applySignatureDefaultsPatch(
      currentSignatures,
      request.accountId ?? null,
      request.defaults
    )

    validateDefaultSignatureIds(signatures)

    await this.save(userId, state.preferences.sidebarOrder, signatures)
    return toPreferencesDto(state.preferences.sidebarOrder, signatures)
  }

  private normalizeSidebarOrder(
    order: MailSidebarOrderItem[],
    ownership: PreferencesOwnership
  ) {
    if (order.length === 0) {
      return []
    }

    const ownedAccountIds = new Set(
      ownership.accounts.map((account) => account.id)
    )
    const ownedProfileIds = new Set(ownership.profiles)
    const normalizedOrder: MailSidebarOrderItem[] = []
    const seenKeys = new Set<string>()

    for (const item of order) {
      if (
        (item.type === "account" && !ownedAccountIds.has(item.id)) ||
        (item.type === "profile" && !ownedProfileIds.has(item.id))
      ) {
        throw new InvalidSidebarOrderError()
      }

      const key = getSidebarOrderItemKey(item)

      if (!seenKeys.has(key)) {
        normalizedOrder.push(item)
        seenKeys.add(key)
      }
    }

    return normalizedOrder
  }

  private validateSignatureDefaultScope(
    accounts: PreferencesOwnership["accounts"],
    scope: { accountId?: string | null; modes: MailSignatureComposeMode[] }
  ) {
    if (!scope.accountId) {
      return
    }

    if (scope.modes.length === 0) {
      throw new InvalidSignatureDefaultsError()
    }

    const account = this.validateSignatureAccount(accounts, scope.accountId)

    if (!account) {
      throw new InvalidSignatureDefaultsError()
    }
  }

  private validateSignatureAccount(
    accounts: PreferencesOwnership["accounts"],
    accountId: string
  ) {
    const account = accounts.find((candidate) => candidate.id === accountId)
    if (!account) {
      throw new InvalidSignatureDefaultsError()
    }
    return account
  }

  private ensureAccountSignatures(
    signatures: MailSignaturesPreferences,
    accounts: PreferencesOwnership["accounts"]
  ): { changed: boolean; value: MailSignaturesPreferences } {
    let changed = false
    const items = [...signatures.items]
    const defaults = {
      global: { ...signatures.defaults.global },
      accounts: { ...signatures.defaults.accounts },
    }

    for (const account of accounts) {
      let accountSignature = items.find(
        (signature) => signature.accountId === account.id
      )

      if (!accountSignature) {
        accountSignature = createDefaultAccountSignature(account)
        items.push(accountSignature)
        changed = true
      }

      const accountDefaults = {
        ...defaults.accounts[account.id],
      }

      for (const mode of signatureComposeModes) {
        if (!Object.hasOwn(accountDefaults, mode)) {
          accountDefaults[mode] = accountSignature.id
          changed = true
        }
      }

      defaults.accounts[account.id] = accountDefaults
    }

    return {
      changed,
      value: {
        ...signatures,
        defaults,
        items,
      },
    }
  }

  private async getState(userId: Id<"users">) {
    const [preferences, ownership] = await Promise.all([
      this.convex.query(internal.preferencesInternal.get, { userId }),
      this.convex.query(internal.preferencesInternal.getOwnership, {
        userId,
      }),
    ])
    return {
      preferences: {
        sidebarOrder: preferences.sidebarOrder as MailSidebarOrderItem[],
        signatures: preferences.signatures as MailSignaturesPreferences,
      },
      ownership,
    }
  }

  private async save(
    userId: Id<"users">,
    sidebarOrder: MailSidebarOrderItem[],
    signatures: MailSignaturesPreferences
  ) {
    await this.convex.mutation(internal.preferencesInternal.save, {
      userId,
      sidebarOrder,
      signatures,
    })
  }
}

type PreferencesOwnership = {
  accounts: Array<{
    id: string
    address: string
    displayName: string | null
  }>
  profiles: string[]
}

function toPreferencesDto(
  order: MailSidebarOrderItem[],
  signatures: MailSignaturesPreferences | null | undefined
): MailPreferencesDto {
  return {
    sidebar: {
      order,
    },
    signatures: normalizeSignatures(signatures),
  }
}

function getSidebarOrderItemKey(item: MailSidebarOrderItem) {
  return `${item.type}:${item.id}`
}

function normalizeSignatures(
  signatures: MailSignaturesPreferences | null | undefined
): MailSignaturesPreferences {
  const source = signatures as
    | (Partial<MailSignaturesPreferences> & {
        defaults?: {
          global?: Partial<MailSignatureDefaults> | null
          accounts?: Record<string, MailSignatureAccountDefaults> | null
        } | null
      })
    | null
    | undefined
  const items = Array.isArray(signatures?.items)
    ? signatures.items.filter(isValidSignature)
    : []
  const itemIds = new Set(items.map((item) => item.id))
  const defaultId =
    source?.defaultId && itemIds.has(source.defaultId)
      ? source.defaultId
      : (items[0]?.id ?? null)
  const global = normalizeGlobalSignatureDefaults(
    source?.defaults?.global,
    itemIds,
    defaultId
  )
  const accounts = normalizeAccountSignatureDefaults(
    source?.defaults?.accounts,
    itemIds
  )

  return {
    defaultId: global.new ?? defaultId,
    defaults: {
      global,
      accounts,
    },
    items,
  }
}

function isValidSignature(value: unknown): value is MailSignatureDto {
  if (!value || typeof value !== "object") {
    return false
  }

  const signature = value as Partial<MailSignatureDto>

  return (
    typeof signature.id === "string" &&
    (signature.accountId === undefined ||
      signature.accountId === null ||
      typeof signature.accountId === "string") &&
    typeof signature.name === "string" &&
    typeof signature.html === "string" &&
    (typeof signature.updatedAt === "string" || signature.updatedAt === null)
  )
}

function createDefaultAccountSignature(account: {
  address: string
  displayName: string | null
  id: string
}): MailSignatureDto {
  const name =
    account.displayName?.trim() || getNameFromAddress(account.address)

  return {
    accountId: account.id,
    id: randomUUID(),
    name: `Основная: ${account.address}`,
    html: `<p>С уважением,<br>${escapeHtml(name)}</p>`,
    updatedAt: new Date().toISOString(),
  }
}

function getNameFromAddress(address: string) {
  const localPart = address.split("@")[0]?.trim()

  return localPart || address
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function normalizeGlobalSignatureDefaults(
  defaults: Partial<MailSignatureDefaults> | null | undefined,
  itemIds: Set<string>,
  fallbackId: string | null
): MailSignatureDefaults {
  return {
    new: normalizeSignatureDefaultValue(defaults, "new", itemIds, fallbackId),
    reply: normalizeSignatureDefaultValue(
      defaults,
      "reply",
      itemIds,
      fallbackId
    ),
    forward: normalizeSignatureDefaultValue(
      defaults,
      "forward",
      itemIds,
      fallbackId
    ),
  }
}

function normalizeAccountSignatureDefaults(
  accounts: Record<string, MailSignatureAccountDefaults> | null | undefined,
  itemIds: Set<string>
) {
  const normalizedAccounts: Record<string, MailSignatureAccountDefaults> = {}

  if (!accounts || typeof accounts !== "object") {
    return normalizedAccounts
  }

  for (const [accountId, defaults] of Object.entries(accounts)) {
    const normalizedDefaults: MailSignatureAccountDefaults = {}

    for (const mode of signatureComposeModes) {
      if (Object.hasOwn(defaults, mode)) {
        normalizedDefaults[mode] = normalizeSignatureId(defaults[mode], itemIds)
      }
    }

    if (Object.keys(normalizedDefaults).length > 0) {
      normalizedAccounts[accountId] = normalizedDefaults
    }
  }

  return normalizedAccounts
}

function normalizeSignatureDefaultValue(
  defaults: Partial<MailSignatureDefaults> | null | undefined,
  mode: MailSignatureComposeMode,
  itemIds: Set<string>,
  fallbackId: string | null
) {
  if (!defaults || !Object.hasOwn(defaults, mode)) {
    return fallbackId
  }

  return normalizeSignatureId(defaults[mode], itemIds)
}

function normalizeSignatureId(value: unknown, itemIds: Set<string>) {
  return typeof value === "string" && itemIds.has(value) ? value : null
}

function applySignatureDefaultModes(
  signatures: MailSignaturesPreferences,
  accountId: string | null,
  modes: MailSignatureComposeMode[],
  signatureId: string
): MailSignaturesPreferences {
  return applySignatureDefaultsPatch(signatures, accountId, {
    ...Object.fromEntries(
      [...new Set(modes)].map((mode) => [mode, signatureId])
    ),
  })
}

function applySignatureDefaultsPatch(
  signatures: MailSignaturesPreferences,
  accountId: string | null,
  defaults: MailSignatureAccountDefaults
): MailSignaturesPreferences {
  const nextSignatures: MailSignaturesPreferences = {
    ...signatures,
    defaults: {
      global: { ...signatures.defaults.global },
      accounts: { ...signatures.defaults.accounts },
    },
  }

  if (accountId) {
    const accountDefaults = {
      ...nextSignatures.defaults.accounts[accountId],
    }

    for (const mode of signatureComposeModes) {
      if (Object.hasOwn(defaults, mode)) {
        accountDefaults[mode] = defaults[mode] ?? null
      }
    }

    nextSignatures.defaults.accounts[accountId] = accountDefaults
  } else {
    for (const mode of signatureComposeModes) {
      if (Object.hasOwn(defaults, mode)) {
        nextSignatures.defaults.global[mode] = defaults[mode] ?? null
      }
    }

    nextSignatures.defaultId =
      nextSignatures.defaults.global.new ?? nextSignatures.items[0]?.id ?? null
  }

  return nextSignatures
}

function validateDefaultSignatureIds(signatures: MailSignaturesPreferences) {
  const itemIds = new Set(signatures.items.map((item) => item.id))
  const ids = [
    signatures.defaults.global.new,
    signatures.defaults.global.reply,
    signatures.defaults.global.forward,
    ...Object.values(signatures.defaults.accounts).flatMap((defaults) =>
      signatureComposeModes.map((mode) => defaults[mode] ?? null)
    ),
  ]

  if (ids.some((id) => id !== null && !itemIds.has(id))) {
    throw new InvalidSignatureDefaultsError()
  }
}
