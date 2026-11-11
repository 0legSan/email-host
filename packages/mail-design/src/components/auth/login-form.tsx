import { formatUiMessage, type UiMessage } from "./ui-message"
import { useMailLocale } from "../../i18n/use-mail-locale"
import * as React from "react"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import { Button } from "@workspace/ui/components/button"

import { AuthError, AuthField } from "./auth-elements"
import { AuthShell } from "./auth-shell"
import { MailThemeToggle } from "../theme/theme-toggle"

export type LoginCredentials = {
  email: string
  password: string
}

type LoginFormProps = {
  defaultEmail?: string
  errorMessage?: string | null
  localizeError?: (message: string) => string
  onSubmit: (credentials: LoginCredentials) => Promise<void>
}

export function LoginForm({
  defaultEmail = "",
  errorMessage = null,
  localizeError = (message) => message,
  onSubmit,
}: LoginFormProps) {
  const { t } = useMailLocale()

  const [email, setEmail] = React.useState(defaultEmail)
  const [password, setPassword] = React.useState("")
  const [submitError, setSubmitError] = React.useState<
    UiMessage | null | undefined
  >(undefined)
  const visibleError = submitError === undefined ? errorMessage : submitError
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit({ email, password })
    } catch (error) {
      setSubmitError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      description={t("Личный почтовый интерфейс", "Personal email interface")}
      headerAction={<MailThemeToggle />}
      width="default"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <AuthField
          autoComplete="username"
          label="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <AuthField
          autoComplete="current-password"
          label={t("Пароль", "Password")}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {visibleError ? (
          <AuthError>{localizeError(formatUiMessage(visibleError))}</AuthError>
        ) : null}
        <Button className="h-10 w-full" disabled={submitting} type="submit">
          {submitting ? <IconLoader2 className="size-4 animate-spin" /> : null}
          {t("Войти", "Sign in")}{" "}
        </Button>
      </form>
    </AuthShell>
  )
}

function getErrorMessage(error: unknown): UiMessage {
  return error instanceof Error
    ? error.message
    : ["Не удалось выполнить запрос", "Could not complete the request"]
}
