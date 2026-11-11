import { Link, useLocation, useNavigate } from "@tanstack/react-router"
import { useId } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import IconDeviceDesktop from "@tabler/icons-react/dist/esm/icons/IconDeviceDesktop.mjs"
import IconKey from "@tabler/icons-react/dist/esm/icons/IconKey.mjs"
import IconMail from "@tabler/icons-react/dist/esm/icons/IconMail.mjs"
import IconSettings from "@tabler/icons-react/dist/esm/icons/IconSettings.mjs"
import IconSignature from "@tabler/icons-react/dist/esm/icons/IconSignature.mjs"
import IconUsers from "@tabler/icons-react/dist/esm/icons/IconUsers.mjs"
import { useMailLocale } from "@workspace/mail-design"
import { cn } from "@workspace/ui/lib/utils"
import {
  getMailMessageIdFromPath,
  getMailRouteDestination,
  updateMailRouteSearch,
  type SettingsRouteTab,
} from "@/lib/mail-route-state"

export function SettingsNavigation({
  activeTab,
  canManageUsers,
}: {
  activeTab: SettingsRouteTab
  canManageUsers: boolean
}) {
  const { t } = useMailLocale()
  const location = useLocation()
  const navigate = useNavigate()
  const sectionId = useId()
  const sections: {
    id: SettingsRouteTab
    label: string
    icon: typeof IconMail
  }[] = [
    { id: "accounts", label: t("Ящики", "Accounts"), icon: IconMail },
    { id: "profiles", label: t("Профили", "Profiles"), icon: IconUsers },
    { id: "signatures", label: t("Подпись", "Signature"), icon: IconSignature },
    ...(canManageUsers
      ? [
          {
            id: "users" as const,
            label: t("Пользователи", "Users"),
            icon: IconKey,
          },
        ]
      : []),
    {
      id: "appearance",
      label: t("Внешний вид", "Appearance"),
      icon: IconDeviceDesktop,
    },
    { id: "offline", label: t("Офлайн", "Offline"), icon: IconSettings },
    {
      id: "application",
      label: t("Приложение", "Application"),
      icon: IconDeviceDesktop,
    },
  ]

  function destination(tab: SettingsRouteTab) {
    return getMailRouteDestination(
      updateMailRouteSearch(location.search, { settings: tab }),
      getMailMessageIdFromPath(location.pathname)
    )
  }

  return (
    <>
      <div className="border-mail-border bg-mail-panel shrink-0 border-b px-4 py-3 md:hidden">
        <div className="text-mail-text-muted grid min-w-0 gap-1.5 text-xs font-medium">
          <label htmlFor={sectionId}>
            {t("Раздел настроек", "Settings section")}
          </label>
          <Select
            value={activeTab}
            onValueChange={(value) =>
              void navigate(destination(value as SettingsRouteTab))
            }
          >
            <SelectTrigger
              id={sectionId}
              aria-label={t("Раздел настроек", "Settings section")}
              className="border-mail-border bg-mail-panel text-mail-text min-h-11 w-full min-w-0 px-3 text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {sections.map(({ id, label }) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <nav
        aria-label={t("Разделы настроек", "Settings sections")}
        className="border-mail-border bg-mail-panel custom-scrollbar hidden w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r p-4 md:flex lg:w-64 lg:p-5"
      >
        {sections.map(({ id, label, icon: Icon }) => (
          <Link
            {...destination(id)}
            aria-current={activeTab === id ? "page" : undefined}
            className={cn(
              "focus-visible:outline-mail-accent flex min-h-11 items-center gap-3 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
              activeTab === id
                ? "bg-mail-accent-soft text-mail-accent-text"
                : "text-mail-text-muted hover:bg-mail-hover hover:text-mail-text"
            )}
            key={id}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}
