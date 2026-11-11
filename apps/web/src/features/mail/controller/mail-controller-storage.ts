import type {
  ComposeDraftValues,
  ComposeInitialValues,
  ComposeViewMode,
} from "@/components/compose-panel"
import {
  composeDraftStorageKey,
  composeViewModeStorageKey,
  defaultMessageListWidth,
  defaultSidebarWidth,
  emailRenderModeOverridesStorageKey,
  knownContactsStorageKeyPrefix,
  mailPanelWidthsStorageKey,
  maximumMessageListWidth,
  maximumSidebarWidth,
  minimumMessageListWidth,
  minimumSidebarWidth,
  pushPromptDismissedStorageKey,
  type EmailRenderModeOverrides,
  type PwaInstallPromptEvent,
  type StoredComposeDraft,
} from "./mail-controller-config"
import type { MailContactDto } from "@/lib/api-client"
import type { EmailRenderMode } from "@/lib/email-render"

export function loadMailPanelWidths() {
  const value = localStorage.getItem(mailPanelWidthsStorageKey)

  if (!value) {
    return {
      sidebarWidth: defaultSidebarWidth,
      messageListWidth: defaultMessageListWidth,
    }
  }

  try {
    const parsedValue: unknown = JSON.parse(value)

    if (
      typeof parsedValue !== "object" ||
      parsedValue === null ||
      Array.isArray(parsedValue)
    ) {
      throw new Error("Invalid panel widths")
    }

    const widths = parsedValue as {
      sidebarWidth?: unknown
      messageListWidth?: unknown
    }

    return {
      sidebarWidth:
        typeof widths.sidebarWidth === "number"
          ? clamp(widths.sidebarWidth, minimumSidebarWidth, maximumSidebarWidth)
          : defaultSidebarWidth,
      messageListWidth:
        typeof widths.messageListWidth === "number"
          ? clamp(
              widths.messageListWidth,
              minimumMessageListWidth,
              maximumMessageListWidth
            )
          : defaultMessageListWidth,
    }
  } catch {
    return {
      sidebarWidth: defaultSidebarWidth,
      messageListWidth: defaultMessageListWidth,
    }
  }
}

export function saveMailPanelWidths(
  sidebarWidth: number,
  messageListWidth: number
) {
  localStorage.setItem(
    mailPanelWidthsStorageKey,
    JSON.stringify({ sidebarWidth, messageListWidth })
  )
}

export function loadComposeViewMode(): ComposeViewMode {
  const value = localStorage.getItem(composeViewModeStorageKey)

  return isComposeViewMode(value) ? value : "floating"
}

export function saveComposeViewMode(viewMode: ComposeViewMode) {
  localStorage.setItem(composeViewModeStorageKey, viewMode)
}

export function loadStoredComposeDraft(): StoredComposeDraft | null {
  const value = localStorage.getItem(composeDraftStorageKey)

  if (!value) {
    return null
  }

  try {
    const parsedValue: unknown = JSON.parse(value)

    if (
      typeof parsedValue !== "object" ||
      parsedValue === null ||
      Array.isArray(parsedValue)
    ) {
      return null
    }

    const draftValues = readComposeDraftValues(
      (parsedValue as { draftValues?: unknown }).draftValues
    )
    const initialValues = readComposeInitialValues(
      (parsedValue as { initialValues?: unknown }).initialValues
    )

    if (!draftValues) {
      return null
    }

    return {
      draftValues,
      initialValues,
    }
  } catch {
    return null
  }
}

export function saveStoredComposeDraft(draft: StoredComposeDraft) {
  localStorage.setItem(composeDraftStorageKey, JSON.stringify(draft))
}

export function clearStoredComposeDraft() {
  localStorage.removeItem(composeDraftStorageKey)
}

export function readComposeDraftValues(
  value: unknown
): ComposeDraftValues | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  const draft = value as Partial<ComposeDraftValues>

  if (
    typeof draft.accountId !== "string" ||
    typeof draft.to !== "string" ||
    typeof draft.subject !== "string" ||
    typeof draft.html !== "string" ||
    typeof draft.trackOpens !== "boolean" ||
    typeof draft.trackClicks !== "boolean"
  ) {
    return null
  }

  return {
    accountId: draft.accountId,
    editorValue: Array.isArray(draft.editorValue)
      ? draft.editorValue
      : undefined,
    to: draft.to,
    cc: typeof draft.cc === "string" ? draft.cc : "",
    bcc: typeof draft.bcc === "string" ? draft.bcc : "",
    subject: draft.subject,
    html: draft.html,
    trackOpens: draft.trackOpens,
    trackClicks: draft.trackClicks,
  }
}

export function readComposeInitialValues(
  value: unknown
): ComposeInitialValues | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const initialValues = value as Partial<ComposeInitialValues>

  if (
    typeof initialValues.title !== "string" ||
    typeof initialValues.accountId !== "string" ||
    typeof initialValues.to !== "string" ||
    typeof initialValues.subject !== "string" ||
    typeof initialValues.html !== "string" ||
    !isComposeInitialMode(initialValues.mode)
  ) {
    return null
  }

  if (
    initialValues.referenceMessageId !== undefined &&
    typeof initialValues.referenceMessageId !== "string"
  ) {
    return null
  }

  return {
    title: initialValues.title,
    accountId: initialValues.accountId,
    to: initialValues.to,
    cc: typeof initialValues.cc === "string" ? initialValues.cc : "",
    bcc: typeof initialValues.bcc === "string" ? initialValues.bcc : "",
    subject: initialValues.subject,
    html: initialValues.html,
    referenceMessageId: initialValues.referenceMessageId,
    mode: initialValues.mode,
  }
}

export function loadEmailRenderModeOverrides(): EmailRenderModeOverrides {
  const value = localStorage.getItem(emailRenderModeOverridesStorageKey)

  if (!value) {
    return {}
  }

  try {
    const parsedValue: unknown = JSON.parse(value)

    if (
      typeof parsedValue !== "object" ||
      parsedValue === null ||
      Array.isArray(parsedValue)
    ) {
      return {}
    }

    const overrides: EmailRenderModeOverrides = {}

    for (const [key, mode] of Object.entries(parsedValue)) {
      if (isEmailRenderMode(mode)) {
        overrides[key] = mode
      }
    }

    return overrides
  } catch {
    return {}
  }
}

export function saveEmailRenderModeOverrides(
  overrides: EmailRenderModeOverrides
) {
  if (Object.keys(overrides).length === 0) {
    localStorage.removeItem(emailRenderModeOverridesStorageKey)
    return
  }

  localStorage.setItem(
    emailRenderModeOverridesStorageKey,
    JSON.stringify(overrides)
  )
}

export function loadPushPromptDismissed() {
  return localStorage.getItem(pushPromptDismissedStorageKey) === "1"
}

export function savePushPromptDismissed(dismissed: boolean) {
  if (dismissed) {
    localStorage.setItem(pushPromptDismissedStorageKey, "1")
    return
  }

  localStorage.removeItem(pushPromptDismissedStorageKey)
}

export function loadKnownContacts(userId: string) {
  try {
    const value = localStorage.getItem(
      `${knownContactsStorageKeyPrefix}${userId}`
    )

    if (!value) {
      return []
    }

    const parsed = JSON.parse(value)

    return Array.isArray(parsed)
      ? parsed.filter(isMailContactDto).slice(0, 300)
      : []
  } catch {
    return []
  }
}

export function saveKnownContacts(userId: string, contacts: MailContactDto[]) {
  localStorage.setItem(
    `${knownContactsStorageKeyPrefix}${userId}`,
    JSON.stringify(contacts.slice(0, 300))
  )
}

export function isMailContactDto(value: unknown): value is MailContactDto {
  if (!value || typeof value !== "object") {
    return false
  }

  const contact = value as Partial<MailContactDto>

  return (
    typeof contact.address === "string" &&
    (contact.name === null || typeof contact.name === "string") &&
    typeof contact.lastInteractionAt === "string"
  )
}

export function isEmailRenderMode(value: unknown): value is EmailRenderMode {
  return value === "auto" || value === "original" || value === "dark"
}

export function isComposeViewMode(value: unknown): value is ComposeViewMode {
  return value === "floating" || value === "modal" || value === "page"
}

export function isPwaStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  )
}

export function isPwaInstallPromptEvent(
  event: Event
): event is PwaInstallPromptEvent {
  return "prompt" in event && "userChoice" in event
}

export function isComposeInitialMode(
  value: unknown
): value is ComposeInitialValues["mode"] {
  return value === "new" || value === "reply" || value === "forward"
}

export function getBaseDomain(domain: string) {
  const parts = domain.split(".").filter(Boolean)

  if (parts.length <= 2) {
    return domain
  }

  const secondLevelDomain = parts.at(-2)
  const topLevelDomain = parts.at(-1)
  const commonSecondLevelSuffixes = new Set([
    "ac",
    "co",
    "com",
    "edu",
    "gov",
    "net",
    "org",
  ])
  const baseLength =
    topLevelDomain?.length === 2 &&
    secondLevelDomain &&
    commonSecondLevelSuffixes.has(secondLevelDomain)
      ? 3
      : 2

  return parts.slice(-baseLength).join(".")
}

export function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
