import { formatUiMessage, type UiMessage } from "./ui-message"
import { useMailLocale } from "../../i18n/use-mail-locale"
import { mailText, getMailIntlLocale } from "../../locale"
import * as React from "react"
import IconCheck from "@tabler/icons-react/dist/esm/icons/IconCheck.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import { Button } from "@workspace/ui/components/button"

import { AuthChecking, AuthError, AuthExpiry, AuthField } from "./auth-elements"
import { AuthShell } from "./auth-shell"

export type AuthLinkStatus =
  | { status: "checking" }
  | { status: "ready"; expiresAt: string }
  | { status: "invalid"; message: string }

export type RegistrationValues = {
  displayName: string
  email: string
  password: string
}

type LinkFormBaseProps = {
  linkStatus: AuthLinkStatus
  onBackToLogin: () => void
}

type RegistrationFormProps = LinkFormBaseProps & {
  onSubmit: (values: RegistrationValues) => Promise<void>
}

export function RegistrationForm({
  linkStatus,
  onBackToLogin,
  onSubmit,
}: RegistrationFormProps) {
  const { t } = useMailLocale()

  const [displayName, setDisplayName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [passwordConfirm, setPasswordConfirm] = React.useState("")
  const submit = usePasswordSubmit(password, passwordConfirm, async () => {
    await onSubmit({ displayName, email, password })
  })

  return (
    <AuthShell
      description={t("Регистрация нового пользователя", "Create an account")}
    >
      <LinkState
        checkingLabel={t(
          "Проверяю ссылку регистрации",
          "Checking registration link"
        )}
        status={linkStatus}
        onBackToLogin={onBackToLogin}
      >
        <form className="grid gap-4" onSubmit={submit.handleSubmit}>
          <AuthExpiry>
            {t("Ссылка активна до", "Link expires")} {formatExpiry(linkStatus)}
          </AuthExpiry>
          <AuthField
            autoComplete="name"
            label={t("Имя", "Name")}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <AuthField
            autoComplete="username"
            label="Email"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <PasswordFields
            confirm={passwordConfirm}
            password={password}
            onConfirmChange={setPasswordConfirm}
            onPasswordChange={setPassword}
          />
          {submit.error ? (
            <AuthError>{formatUiMessage(submit.error)}</AuthError>
          ) : null}
          <SubmitButton
            label={t("Создать аккаунт", "Create account")}
            submitting={submit.submitting}
          />
        </form>
      </LinkState>
    </AuthShell>
  )
}

type PasswordResetFormProps = LinkFormBaseProps & {
  onSubmit: (password: string) => Promise<void>
}

export function PasswordResetForm({
  linkStatus,
  onBackToLogin,
  onSubmit,
}: PasswordResetFormProps) {
  const { t } = useMailLocale()

  const [password, setPassword] = React.useState("")
  const [passwordConfirm, setPasswordConfirm] = React.useState("")
  const submit = usePasswordSubmit(password, passwordConfirm, () =>
    onSubmit(password)
  )

  return (
    <AuthShell description={t("Восстановление пароля", "Reset password")}>
      <LinkState
        checkingLabel={t(
          "Проверяю ссылку восстановления",
          "Checking password reset link"
        )}
        status={linkStatus}
        onBackToLogin={onBackToLogin}
      >
        <form className="grid gap-4" onSubmit={submit.handleSubmit}>
          <AuthExpiry>
            {t("Ссылка активна до", "Link expires")} {formatExpiry(linkStatus)}
          </AuthExpiry>
          <PasswordFields
            confirm={passwordConfirm}
            password={password}
            passwordLabel={t("Новый пароль", "New password")}
            onConfirmChange={setPasswordConfirm}
            onPasswordChange={setPassword}
          />
          {submit.error ? (
            <AuthError>{formatUiMessage(submit.error)}</AuthError>
          ) : null}
          <SubmitButton
            label={t("Сохранить новый пароль", "Save new password")}
            submitting={submit.submitting}
          />
        </form>
      </LinkState>
    </AuthShell>
  )
}

function LinkState({
  children,
  checkingLabel,
  status,
  onBackToLogin,
}: {
  children: React.ReactNode
  checkingLabel: string
  status: AuthLinkStatus
  onBackToLogin: () => void
}) {
  const { t } = useMailLocale()

  if (status.status === "checking") {
    return <AuthChecking>{checkingLabel}</AuthChecking>
  }
  if (status.status === "invalid") {
    return (
      <div className="grid gap-4">
        <AuthError>{status.message}</AuthError>
        <Button type="button" onClick={onBackToLogin}>
          {t("Перейти ко входу", "Go to sign in")}{" "}
        </Button>
      </div>
    )
  }
  return children
}

function PasswordFields({
  confirm,
  password,
  passwordLabel = mailText("Пароль", "Password"),
  onConfirmChange,
  onPasswordChange,
}: {
  confirm: string
  password: string
  passwordLabel?: string
  onConfirmChange: (value: string) => void
  onPasswordChange: (value: string) => void
}) {
  const { t } = useMailLocale()

  return (
    <>
      <AuthField
        autoComplete="new-password"
        label={passwordLabel}
        minLength={8}
        required
        type="password"
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
      />
      <AuthField
        autoComplete="new-password"
        label={t("Повтор пароля", "Confirm password")}
        minLength={8}
        required
        type="password"
        value={confirm}
        onChange={(event) => onConfirmChange(event.target.value)}
      />
    </>
  )
}

function SubmitButton({
  label,
  submitting,
}: {
  label: string
  submitting: boolean
}) {
  return (
    <Button className="h-10 w-full" disabled={submitting} type="submit">
      {submitting ? (
        <IconLoader2 className="size-4 animate-spin" />
      ) : (
        <IconCheck className="size-4" />
      )}
      {label}
    </Button>
  )
}

function usePasswordSubmit(
  password: string,
  confirmation: string,
  submit: () => Promise<void>
) {
  const [error, setError] = React.useState<UiMessage | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password !== confirmation) {
      setError(["Пароли не совпадают", "Passwords do not match"])
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await submit()
    } catch (submitError) {
      setError(getErrorMessage(submitError))
    } finally {
      setSubmitting(false)
    }
  }

  return { error, handleSubmit, submitting }
}

function formatExpiry(status: AuthLinkStatus) {
  if (status.status !== "ready") {
    return ""
  }
  return new Intl.DateTimeFormat(getMailIntlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(status.expiresAt))
}

function getErrorMessage(error: unknown): UiMessage {
  return error instanceof Error
    ? error.message
    : ["Не удалось выполнить запрос", "Could not complete the request"]
}
