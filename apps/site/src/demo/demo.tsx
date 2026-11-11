import { useEffect, useState } from "react"
import { MailLanguagePicker, useMailLocale } from "@workspace/mail-design"
import { RouterProvider } from "@tanstack/react-router"
import { clearOfflineMailCache } from "@/lib/offline-mail-cache"
import { clearPendingMessageMutations } from "@/lib/offline-mail-pending"
import { demoRouter } from "./router"
import { mailStorageKey } from "./storage-namespace"
import { embeddedDemo } from "./presentation"

export function Demo() {
  const { locale, t } = useMailLocale()
  useEffect(() => {
    document.title = t("Демо Email Host", "Email Host demo")
  }, [t])
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function resetDemo() {
    setResetting(true)
    try {
      await clearPendingMessageMutations()
      await clearOfflineMailCache()
      localStorage.removeItem(mailStorageKey("compose-draft:v1"))
      window.location.reload()
    } catch {
      setError(
        t(
          "Не удалось сбросить демо. Перезагрузите страницу.",
          "Could not reset the demo. Reload the page."
        )
      )
      setResetting(false)
    }
  }

  return (
    <div className={embeddedDemo ? "demo-root demo-embedded" : "demo-root"}>
      {!embeddedDemo && (
        <header className="demo-banner">
          <a className="demo-back" href={locale === "en" ? "/en/" : "/"}>
            {t("← На сайт", "← Back to site")}
          </a>
          <p data-mobile-note={t("Без отправки писем", "No real email sent")}>
            <strong>{t("Демо", "Demo")}</strong>
            <span>
              {t(
                "Вымышленные данные. Отправка имитируется.",
                "Fictional data. Sending is simulated."
              )}
            </span>
          </p>
          <div>
            <MailLanguagePicker compact />
            <button
              onClick={() =>
                void demoRouter.navigate({
                  to: "/mail/settings",
                  search: { settings: "appearance" },
                })
              }
              type="button"
            >
              {t("Внешний вид", "Appearance")}
            </button>
            <button
              disabled={resetting}
              onClick={() => void resetDemo()}
              type="button"
            >
              {resetting
                ? t("Сбрасываем…", "Resetting…")
                : t("Сбросить демо", "Reset demo")}
            </button>
          </div>
        </header>
      )}
      {error ? (
        <p className="demo-error" role="status">
          {error}
        </p>
      ) : null}
      <div className="demo-canvas">
        <RouterProvider router={demoRouter} />
      </div>
    </div>
  )
}
