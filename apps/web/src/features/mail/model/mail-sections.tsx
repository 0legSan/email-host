import { mailText } from "@workspace/mail-design/locale"
import type { ComponentType } from "react"
import IconFileText from "@tabler/icons-react/dist/esm/icons/IconFileText.mjs"
import IconFolderX from "@tabler/icons-react/dist/esm/icons/IconFolderX.mjs"
import IconInbox from "@tabler/icons-react/dist/esm/icons/IconInbox.mjs"
import IconPinned from "@tabler/icons-react/dist/esm/icons/IconPinned.mjs"
import IconSend from "@tabler/icons-react/dist/esm/icons/IconSend.mjs"
import IconTrash from "@tabler/icons-react/dist/esm/icons/IconTrash.mjs"

export type MailSection = {
  id: "inbox" | "pinned" | "sent" | "drafts" | "junk" | "trash"
  title: string
  specialUse: string | null
  flagged?: boolean
  icon: ComponentType<{ className?: string }>
}

export const standardSpecialUses = new Set([
  "\\Inbox",
  "\\Sent",
  "\\Drafts",
  "\\Junk",
  "\\Trash",
])

export const mailSections: MailSection[] = [
  {
    id: "inbox",
    get title() {
      return mailText("Входящие", "Inbox")
    },
    specialUse: "\\Inbox",
    icon: IconInbox,
  },
  {
    id: "pinned",
    get title() {
      return mailText("Закрепленные", "Pinned")
    },
    specialUse: null,
    flagged: true,
    icon: IconPinned,
  },
  {
    id: "sent",
    get title() {
      return mailText("Отправленные", "Sent")
    },
    specialUse: "\\Sent",
    icon: IconSend,
  },
  {
    id: "drafts",
    get title() {
      return mailText("Черновики", "Drafts")
    },
    specialUse: "\\Drafts",
    icon: IconFileText,
  },
  {
    id: "junk",
    get title() {
      return mailText("Спам", "Spam")
    },
    specialUse: "\\Junk",
    icon: IconFolderX,
  },
  {
    id: "trash",
    get title() {
      return mailText("Удаленные", "Trash")
    },
    specialUse: "\\Trash",
    icon: IconTrash,
  },
]
