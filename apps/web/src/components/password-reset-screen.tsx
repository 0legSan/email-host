import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  PasswordResetForm,
  type AuthLinkStatus,
} from "@workspace/mail-design/auth"

import {
  apiFetch,
  type GetPasswordResetLinkResponse,
  type ResetPasswordResponse,
} from "@/lib/api-client"
import {
  defaultMailRouteSearch,
  toMailRouteSearch,
} from "@/lib/mail-route-state"

export function PasswordResetScreen({ token }: { token: string }) {
  const { t } = useMailLocale()

  const navigate = useNavigate()
  const [linkStatus, setLinkStatus] = React.useState<AuthLinkStatus>({
    status: "checking",
  })

  React.useEffect(() => {
    let active = true

    void apiFetch<GetPasswordResetLinkResponse>(
      `/api/auth/password-reset-links/${encodeURIComponent(token)}`
    )
      .then((data) => {
        if (active) {
          setLinkStatus({ status: "ready", expiresAt: data.link.expiresAt })
        }
      })
      .catch(() => {
        if (active) {
          setLinkStatus({
            status: "invalid",
            message: "",
          })
        }
      })

    return () => {
      active = false
    }
  }, [token])

  const navigateToLogin = React.useCallback(() => {
    void navigate({
      to: "/mail",
      search: toMailRouteSearch(defaultMailRouteSearch),
      replace: true,
    })
  }, [navigate])

  return (
    <PasswordResetForm
      linkStatus={
        linkStatus.status === "invalid"
          ? {
              ...linkStatus,
              message: t(
                "Ссылка восстановления недействительна или уже использована",
                "The password reset link is invalid or has already been used"
              ),
            }
          : linkStatus
      }
      onBackToLogin={navigateToLogin}
      onSubmit={async (password) => {
        await apiFetch<ResetPasswordResponse>("/api/auth/reset-password", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, password }),
        })
        navigateToLogin()
      }}
    />
  )
}
