import IconDeviceDesktop from "@tabler/icons-react/dist/esm/icons/IconDeviceDesktop.mjs"
import IconMoon from "@tabler/icons-react/dist/esm/icons/IconMoon.mjs"
import IconSun from "@tabler/icons-react/dist/esm/icons/IconSun.mjs"
import { Button } from "@workspace/ui/components/button"
import { Tooltip } from "@workspace/ui/components/tooltip"

import { useMailLocale } from "../../i18n/use-mail-locale"

import { useMailTheme, type MailTheme } from "./theme-provider"

export function MailThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useMailTheme()
  const { t } = useMailLocale()
  const themeLabels = {
    system: t("Системная тема", "System theme"),
    light: t("Светлая тема", "Light theme"),
    dark: t("Темная тема", "Dark theme"),
  }
  const nextThemeLabels = {
    system: t("системную тему", "system theme"),
    light: t("светлую тему", "light theme"),
    dark: t("темную тему", "dark theme"),
  }
  const nextTheme: MailTheme =
    theme === "system" ? "light" : theme === "light" ? "dark" : "system"

  return (
    <Tooltip content={themeLabels[theme]}>
      <Button
        aria-label={t(
          `Сейчас: ${themeLabels[theme]}. Включить ${nextThemeLabels[nextTheme]}`,
          `Current: ${themeLabels[theme]}. Use ${nextThemeLabels[nextTheme]}`
        )}
        size="icon-sm"
        variant="ghost"
        onClick={() => setTheme(nextTheme)}
      >
        {theme === "system" ? (
          <IconDeviceDesktop className="size-4" />
        ) : resolvedTheme === "dark" ? (
          <IconSun className="size-4" />
        ) : (
          <IconMoon className="size-4" />
        )}
      </Button>
    </Tooltip>
  )
}
