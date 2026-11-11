import { useMailLocale } from "@workspace/mail-design"
import IconBell from "@tabler/icons-react/dist/esm/icons/IconBell.mjs"
import IconBellRinging from "@tabler/icons-react/dist/esm/icons/IconBellRinging.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconX from "@tabler/icons-react/dist/esm/icons/IconX.mjs"
import type { PushSubscriptionState } from "@workspace/pwa/client"
import { Button } from "@workspace/ui/components/button"

export function PushPermissionPrompt({
  state,
  loading,
  onDismiss,
  onEnable,
}: {
  state: PushSubscriptionState
  loading: boolean
  onDismiss: () => void
  onEnable: () => void
}) {
  const { t } = useMailLocale()

  const completingSubscription = state === "granted"

  return (
    <div className="mx-4 my-4 flex items-start gap-3 border border-[#c7d6e2] bg-[#f8fbfd] p-3 text-sm text-[#34404b] dark:border-[#34404a] dark:bg-[#181d21] dark:text-[#d9e2ea]">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center border border-[#c7d6e2] bg-white text-[#1769aa] dark:border-[#34404a] dark:bg-[#101214] dark:text-[#72b7e8]">
        <IconBell className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[#20252a] dark:text-[#eef2f4]">
          {completingSubscription
            ? t(
                "Завершить подключение уведомлений",
                "Finish setting up notifications"
              )
            : t(
                "Включить уведомления о новых письмах",
                "Enable new mail notifications"
              )}
        </p>
        <p className="mt-1 text-xs leading-5 text-[#5f6b76] dark:text-[#a9b3bd]">
          {completingSubscription
            ? t(
                "Разрешение уже выдано, осталось сохранить push-подписку.",
                "Permission is already granted. Save the push subscription to finish."
              )
            : t(
                "После разрешения браузера отправим проверочный push.",
                "We will send a test push after you grant browser permission."
              )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          className="gap-1.5"
          disabled={loading}
          size="sm"
          type="button"
          onClick={onEnable}
        >
          {loading ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconBellRinging className="size-3.5" />
          )}
          <span>
            {completingSubscription
              ? t("Завершить", "Finish")
              : t("Включить", "Enable")}
          </span>
        </Button>
        {completingSubscription ? null : (
          <Button
            aria-label={t(
              "Скрыть запрос уведомлений",
              "Dismiss notification prompt"
            )}
            disabled={loading}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={onDismiss}
          >
            <IconX className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
