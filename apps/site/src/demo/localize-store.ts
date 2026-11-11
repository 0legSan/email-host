import { getMailLocale, type MailLocale } from "@workspace/mail-design/locale"
import { createDemoData } from "./data"
import { demoStore } from "./store"

let dataLocale = getMailLocale()

// Change only unedited seed content. Read flags, moves and user-created emails survive.
export function localizeDemoStore(locale: MailLocale) {
  if (locale === dataLocale) return false
  const previous = createDemoData(dataLocale)
  const next = createDemoData(locale)
  const oldMessages = new Map(
    previous.messages.map((message) => [message.id, message])
  )
  const newMessages = new Map(
    next.messages.map((message) => [message.id, message])
  )
  for (const message of demoStore.messages) {
    const old = oldMessages.get(message.id)
    const fresh = newMessages.get(message.id)
    if (!old || !fresh) continue
    for (const field of ["subject", "snippet", "text", "html"] as const) {
      if (message[field] === old[field]) message[field] = fresh[field]
    }
    if (message.from?.name === old.from?.name && message.from && fresh.from)
      message.from.name = fresh.from.name
    for (const attachment of message.attachments) {
      const oldFile = old.attachments.find((file) => file.id === attachment.id)
      const newFile = fresh.attachments.find(
        (file) => file.id === attachment.id
      )
      if (oldFile && newFile && attachment.filename === oldFile.filename)
        attachment.filename = newFile.filename
    }
  }
  for (const current of demoStore.accounts) {
    const old = previous.accounts.find((account) => account.id === current.id)
    const fresh = next.accounts.find((account) => account.id === current.id)
    if (!old || !fresh) continue
    if (current.label === old.label) current.label = fresh.label
    if (current.displayName === old.displayName)
      current.displayName = fresh.displayName
  }
  for (const current of demoStore.profiles) {
    const old = previous.profiles.find((profile) => profile.id === current.id)
    const fresh = next.profiles.find((profile) => profile.id === current.id)
    if (old && fresh && current.name === old.name) current.name = fresh.name
  }
  const current = demoStore.preferences.signatures?.items.find(
    (signature) => signature.id === "signature-work"
  )
  const old = previous.preferences.signatures?.items[0]
  const fresh = next.preferences.signatures?.items[0]
  if (current && old && fresh) {
    if (current.name === old.name) current.name = fresh.name
    if (current.html === old.html) current.html = fresh.html
  }
  dataLocale = locale
  return true
}
