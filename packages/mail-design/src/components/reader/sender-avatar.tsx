import { mailText } from "../../locale"
import { useMailLocale } from "../../i18n/use-mail-locale"
import * as React from "react"
import { Tooltip } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"
import type { MailAddressView } from "../../types/mail"

export function MailSenderAvatar({
  address,
  label,
}: {
  address: MailAddressView | null | undefined
  label?: string
}) {
  const { t } = useMailLocale()

  const senderName = label ?? formatSenderName(address)
  const logoUrls = React.useMemo(() => getSenderLogoUrls(address), [address])
  const [logoIndex, setLogoIndex] = React.useState(0)
  const logoUrl = logoUrls[logoIndex]

  return (
    <Tooltip content={senderName}>
      <span
        aria-label={t(
          `Лого отправителя: ${senderName}`,
          `Sender logo: ${senderName}`
        )}
        className={cn(
          "grid size-12 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-extrabold text-white shadow-sm",
          logoUrl ? "bg-white" : getSenderLogoColorClassName(address)
        )}
      >
        {logoUrl ? (
          <img
            alt=""
            className="size-full object-cover"
            referrerPolicy="no-referrer"
            src={logoUrl}
            onError={() => setLogoIndex((currentIndex) => currentIndex + 1)}
          />
        ) : (
          getSenderLogoInitials(address)
        )}
      </span>
    </Tooltip>
  )
}

function formatSenderName(address: MailAddressView | null | undefined) {
  if (!address) return mailText("Неизвестный отправитель", "Unknown sender")
  return (
    address.name?.trim() || address.address.split("@")[0] || address.address
  )
}

const senderLogoColorClassNames = [
  "bg-[#3b82f6]",
  "bg-[#1f8a70]",
  "bg-[#8b5cf6]",
  "bg-[#d97706]",
  "bg-[#0f766e]",
  "bg-[#be123c]",
  "bg-[#475569]",
]

function getSenderLogoInitials(address: MailAddressView | null | undefined) {
  const parts = formatSenderName(address)
    .replace(/["'<>]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0]?.charAt(0) ?? ""}${parts[1]?.charAt(0) ?? ""}`.toUpperCase()
  }

  const [firstPart = "M"] = parts
  return Array.from(firstPart).slice(0, 2).join("").toUpperCase()
}

function getSenderLogoUrls(address: MailAddressView | null | undefined) {
  const domain = address?.address.split("@")[1]?.trim().toLowerCase()
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return []

  // Reserved demo domains cannot provide remote brand assets.
  if (/\.(example|invalid|test|localhost)$/.test(domain)) return []

  const baseDomain = getBaseDomain(domain)
  const domains = baseDomain === domain ? [domain] : [domain, baseDomain]
  const paths = [
    "/favicon.ico",
    "/favicon.png",
    "/favicon.svg",
    "/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png",
  ]
  return domains.flatMap((candidateDomain) =>
    paths.map((path) => `https://${candidateDomain}${path}`)
  )
}

function getBaseDomain(domain: string) {
  const parts = domain.split(".").filter(Boolean)
  if (parts.length <= 2) return domain
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

function getSenderLogoColorClassName(
  address: MailAddressView | null | undefined
) {
  const source = `${address?.name ?? ""}${address?.address ?? ""}` || "mail"
  let hash = 0
  for (const character of source) {
    hash =
      (hash + (character.codePointAt(0) ?? 0)) %
      senderLogoColorClassNames.length
  }
  return senderLogoColorClassNames[hash] ?? senderLogoColorClassNames[0]
}
