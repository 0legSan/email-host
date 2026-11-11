import { useMailLocale } from "@workspace/mail-design"
/* eslint-disable react-refresh/only-export-components -- Route modules export router objects. */
import { useEffect } from "react"
import {
  type ErrorComponentProps,
  Navigate,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router"

import { App } from "@/App"
import { PasswordResetScreen } from "@/components/password-reset-screen"
import { RegisterScreen } from "@/components/register-screen"
import { queryClient } from "@/lib/query-client"
import {
  defaultMailRouteSearch,
  parseMailRouteSearch,
  parseSettingsRouteSearch,
  parseAddAccountRouteSearch,
  toMailRouteSearch,
} from "@/lib/mail-route-state"

const rootRoute = createRootRoute({
  component: Outlet,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => (
    <Navigate
      replace
      search={toMailRouteSearch(defaultMailRouteSearch)}
      to="/mail"
    />
  ),
})

const mailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mail",
  validateSearch: parseMailRouteSearch,
  component: App,
  errorComponent: MailRouteError,
})

const mailMessageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mail/message/$messageId",
  validateSearch: parseMailRouteSearch,
  component: App,
  errorComponent: MailRouteError,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register/$token",
  component: RegisterRoute,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mail/settings",
  validateSearch: parseSettingsRouteSearch,
  component: App,
  errorComponent: MailRouteError,
})

const messageSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mail/message/$messageId/settings",
  validateSearch: parseSettingsRouteSearch,
  component: App,
  errorComponent: MailRouteError,
})

const passwordResetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset-password/$token",
  component: PasswordResetRoute,
})

const addAccountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mail/settings/accounts/new",
  validateSearch: parseAddAccountRouteSearch,
  component: App,
  errorComponent: MailRouteError,
})

const messageAddAccountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mail/message/$messageId/settings/accounts/new",
  validateSearch: parseAddAccountRouteSearch,
  component: App,
  errorComponent: MailRouteError,
})

function RegisterRoute() {
  const params = registerRoute.useParams()

  return <RegisterScreen token={params.token} />
}

function PasswordResetRoute() {
  const params = passwordResetRoute.useParams()

  return <PasswordResetScreen token={params.token} />
}

function MailRouteError({ reset }: ErrorComponentProps) {
  const { t } = useMailLocale()
  useEffect(() => {
    window.addEventListener("online", reset)
    return () => window.removeEventListener("online", reset)
  }, [reset])

  return (
    <main className="grid min-h-svh place-items-center bg-[#f3f5f7] p-4 text-[#16191d] dark:bg-[#101214] dark:text-[#f6f3ef]">
      <section className="w-full max-w-md border border-[#d8dee5] bg-white p-6 shadow-[0_24px_80px_rgba(23,31,38,0.12)] dark:border-[#30353a] dark:bg-[#181b1f]">
        <h1 className="text-base font-semibold">
          {t("Не удалось обновить почту", "Could not update your inbox")}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#68727d] dark:text-[#a7b0ba]">
          {t(
            "Сохранённые письма останутся доступны офлайн. После восстановления соединения приложение повторит синхронизацию.",
            "Saved emails remain available offline. The app will retry synchronization when the connection is restored."
          )}
        </p>
        <button
          className="mt-5 h-10 border border-[#151719] bg-[#151719] px-4 text-sm font-semibold text-white dark:border-[#f6f3ef] dark:bg-[#f6f3ef] dark:text-[#111315]"
          onClick={reset}
          type="button"
        >
          {t("Повторить", "Retry")}
        </button>
      </section>
    </main>
  )
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  mailRoute,
  mailMessageRoute,
  settingsRoute,
  messageSettingsRoute,
  addAccountRoute,
  messageAddAccountRoute,
  registerRoute,
  passwordResetRoute,
])

export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPreload: "intent",
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
