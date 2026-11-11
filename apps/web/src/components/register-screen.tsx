import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  RegistrationForm,
  type AuthLinkStatus,
} from "@workspace/mail-design/auth"

import { apiFetch, type GetRegistrationInviteResponse } from "@/lib/api-client"
import {
  defaultMailRouteSearch,
  toMailRouteSearch,
} from "@/lib/mail-route-state"

export function RegisterScreen({ token }: { token: string }) {
  const { t } = useMailLocale()

  const navigate = useNavigate()
  const [linkStatus, setLinkStatus] = React.useState<AuthLinkStatus>({
    status: "checking",
  })

  React.useEffect(() => {
    let active = true

    void apiFetch<GetRegistrationInviteResponse>(
      `/api/auth/registration-invites/${encodeURIComponent(token)}`
    )
      .then((data) => {
        if (active) {
          setLinkStatus({ status: "ready", expiresAt: data.invite.expiresAt })
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
    <RegistrationForm
      linkStatus={
        linkStatus.status === "invalid"
          ? {
              ...linkStatus,
              message: t(
                "Ссылка регистрации недействительна или уже использована",
                "The registration link is invalid or has already been used"
              ),
            }
          : linkStatus
      }
      onBackToLogin={navigateToLogin}
      onSubmit={async ({ displayName, email, password }) => {
        await apiFetch<{ user: unknown }>("/api/auth/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            token,
            email,
            password,
            displayName: displayName.trim() || undefined,
          }),
        })
        navigateToLogin()
      }}
    />
  )
}
