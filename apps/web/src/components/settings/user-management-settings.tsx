import { formatUiMessage, type UiMessage } from "../ui-message"
import { useMailLocale } from "@workspace/mail-design"
import {
  mailText,
  getMailIntlLocale,
  getMailLocale,
} from "@workspace/mail-design/locale"
import * as React from "react"
import IconCheck from "@tabler/icons-react/dist/esm/icons/IconCheck.mjs"
import IconCopy from "@tabler/icons-react/dist/esm/icons/IconCopy.mjs"
import IconKey from "@tabler/icons-react/dist/esm/icons/IconKey.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconRefresh from "@tabler/icons-react/dist/esm/icons/IconRefresh.mjs"
import IconUserOff from "@tabler/icons-react/dist/esm/icons/IconUserOff.mjs"
import {
  apiFetch,
  type CreatePasswordResetLinkResponse,
  type CreateRegistrationInviteResponse,
  type DeactivateManagedUserResponse,
  type ListManagedUsersResponse,
  type ManagedUserDto,
} from "@/lib/api-client"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { settingsInputClassName } from "./account-settings-model"
import { SettingsError, SettingsField } from "./settings-shared"

type CreatedUserManagementLink = {
  expiresAt: string
  kind: "registration" | "passwordReset"
  title: UiMessage
  url: string
}

export function UserManagementSettingsPanel() {
  const { t } = useMailLocale()

  const [expiresInDays, setExpiresInDays] = React.useState("7")
  const [resetExpiresInDays, setResetExpiresInDays] = React.useState("7")
  const [createdLink, setCreatedLink] =
    React.useState<CreatedUserManagementLink | null>(null)
  const [users, setUsers] = React.useState<ManagedUserDto[]>([])
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(
    null
  )
  const [usersLoading, setUsersLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [resetSaving, setResetSaving] = React.useState(false)
  const [deactivating, setDeactivating] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [error, setError] = React.useState<UiMessage | null>(null)
  const [deactivateDialogOpen, setDeactivateDialogOpen] = React.useState(false)
  const selectedUser =
    users.find((user) => user.id === selectedUserId) ?? users[0] ?? null
  const selectedUserActive = selectedUser ? !selectedUser.deactivatedAt : false

  const loadUsers = React.useCallback(async (showLoading = true) => {
    if (showLoading) {
      setUsersLoading(true)
      setError(null)
    }

    try {
      const data = await listManagedUsers()
      setUsers(data.users)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setUsersLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- User list is loaded from the API when the owner tab mounts.
    void loadUsers(false)
  }, [loadUsers])

  async function handleCreateInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setCopied(false)
    setError(null)

    try {
      const days = Number.parseInt(expiresInDays, 10)
      const data = await createRegistrationInvite({
        expiresInDays: Number.isFinite(days) ? days : 7,
      })

      setCreatedLink({
        kind: "registration",
        title: ["Ссылка регистрации", "Registration link"],
        url: buildRegistrationInviteUrl(data.invite.token),
        expiresAt: data.invite.expiresAt,
      })
    } catch (createError) {
      setError(getErrorMessage(createError))
    } finally {
      setSaving(false)
    }
  }

  async function handleCreatePasswordResetLink() {
    if (!selectedUser) {
      return
    }

    setResetSaving(true)
    setCopied(false)
    setError(null)

    try {
      const days = Number.parseInt(resetExpiresInDays, 10)
      const data = await createPasswordResetLink(selectedUser.id, {
        expiresInDays: Number.isFinite(days) ? days : 7,
      })

      setCreatedLink({
        kind: "passwordReset",
        title: [
          `Восстановление: ${getManagedUserTitle(data.user)}`,
          `Password reset: ${getManagedUserTitle(data.user)}`,
        ],
        url: buildPasswordResetUrl(data.link.token),
        expiresAt: data.link.expiresAt,
      })
      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === data.user.id ? data.user : user
        )
      )
    } catch (createError) {
      setError(getErrorMessage(createError))
    } finally {
      setResetSaving(false)
    }
  }

  function handleDeactivateUser() {
    if (!selectedUser || selectedUser.role === "owner" || !selectedUserActive) {
      return
    }

    setDeactivateDialogOpen(true)
  }

  async function confirmDeactivateUser() {
    if (!selectedUser || selectedUser.role === "owner" || !selectedUserActive) {
      return
    }

    setDeactivating(true)
    setError(null)

    try {
      const data = await deactivateManagedUser(selectedUser.id)

      setUsers((currentUsers) =>
        currentUsers.map((user) =>
          user.id === data.user.id ? data.user : user
        )
      )
      setDeactivateDialogOpen(false)
    } catch (deactivateError) {
      setError(getErrorMessage(deactivateError))
    } finally {
      setDeactivating(false)
    }
  }

  async function handleCopyLink() {
    if (!createdLink) {
      return
    }

    try {
      await navigator.clipboard.writeText(createdLink.url)
      setCopied(true)
    } catch (copyError) {
      setError(getErrorMessage(copyError))
    }
  }

  return (
    <>
      <div className="grid min-w-0 gap-6 @3xl/settings:grid-cols-2">
        <section className="grid min-w-0 content-start gap-6 border border-[#d8dee5] bg-[#fbfcfd] p-4 @3xl/settings:col-span-2 @3xl/settings:grid-cols-2 dark:border-[#30353a] dark:bg-[#131619]">
          <form
            className="grid gap-4"
            onSubmit={(event) => void handleCreateInvite(event)}
          >
            <div>
              <h3 className="text-sm font-semibold">
                {t("Регистрация", "Registration")}
              </h3>
              <p className="mt-1 text-sm leading-5 text-[#68727d] dark:text-[#a7b0ba]">
                {t(
                  "Одноразовая ссылка для нового пользователя приложения.",
                  "A one-time link for a new app user."
                )}{" "}
              </p>
            </div>

            <SettingsField label={t("Срок действия, дней", "Validity, days")}>
              <Input
                className={settingsInputClassName}
                max={30}
                min={1}
                required
                type="number"
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(event.target.value)}
              />
            </SettingsField>

            <Button disabled={saving} type="submit">
              {saving ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconKey className="size-4" />
              )}
              {t("Создать ссылку", "Create link")}{" "}
            </Button>
          </form>

          <div className="border-t border-[#d8dee5] pt-4 @3xl/settings:border-t-0 @3xl/settings:border-l @3xl/settings:pt-0 @3xl/settings:pl-6 dark:border-[#30353a]">
            <h3 className="text-sm font-semibold">
              {t("Готовая ссылка", "Created link")}
            </h3>
            {createdLink ? (
              <div className="mt-4 grid gap-3">
                <div className="grid gap-1.5">
                  <span className="text-xs font-semibold text-[#4c5661] dark:text-[#c4ccd4]">
                    {formatUiMessage(createdLink.title)}
                  </span>
                  <div className="flex min-w-0 gap-2">
                    <Input
                      className={settingsInputClassName}
                      readOnly
                      value={createdLink.url}
                    />
                    <Button
                      aria-label={t("Скопировать ссылку", "Copy link")}
                      size="icon"
                      type="button"
                      variant="secondary"
                      onClick={() => void handleCopyLink()}
                    >
                      {copied ? (
                        <IconCheck className="size-4" />
                      ) : (
                        <IconCopy className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-[#68727d] dark:text-[#a7b0ba]">
                  {t("Действует до", "Expires")}{" "}
                  {formatDateTime(createdLink.expiresAt)}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-[#68727d] dark:text-[#a7b0ba]">
                {t(
                  "Создай ссылку и отправь её пользователю.",
                  "Create a link and send it to the user."
                )}{" "}
              </p>
            )}
          </div>

          {error ? (
            <SettingsError>{formatUiMessage(error)}</SettingsError>
          ) : null}
        </section>

        <section className="min-w-0 border border-[#d8dee5] bg-[#fbfcfd] p-4 dark:border-[#30353a] dark:bg-[#131619]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {t("Пользователи", "Users")}
            </h3>
            <Button
              aria-label={t(
                "Обновить список пользователей",
                "Refresh user list"
              )}
              disabled={usersLoading}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => void loadUsers()}
            >
              <IconRefresh
                className={cn("size-4", usersLoading ? "animate-spin" : "")}
              />
            </Button>
          </div>

          <div className="grid gap-2">
            {users.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#68727d] dark:text-[#a7b0ba]">
                {t("Пользователей нет", "No users")}{" "}
              </p>
            ) : (
              users.map((user) => (
                <button
                  className={cn(
                    "grid min-w-0 gap-1 border p-3 text-left transition",
                    selectedUser?.id === user.id
                      ? "border-[#151719] bg-white dark:border-[#f6f3ef] dark:bg-[#181b1f]"
                      : "border-[#e2e7eb] bg-white hover:border-[#b8c2cc] dark:border-[#2b3035] dark:bg-[#181b1f] dark:hover:border-[#59636d]"
                  )}
                  key={user.id}
                  type="button"
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <span className="flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {getManagedUserTitle(user)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 border px-2 py-0.5 text-[11px] font-semibold",
                        user.deactivatedAt
                          ? "border-[#e6b8b0] bg-[#fff4f1] text-[#963828] dark:border-[#6c3a33] dark:bg-[#281d1b] dark:text-[#ffb3a7]"
                          : "border-[#d8e6df] bg-[#f1faf6] text-[#176d59] dark:border-[#26483c] dark:bg-[#132722] dark:text-[#7ed8bf]"
                      )}
                    >
                      {formatManagedUserStatus(user)}
                    </span>
                  </span>
                  <span className="truncate text-xs text-[#68727d] dark:text-[#a7b0ba]">
                    {user.email}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="grid min-w-0 content-start gap-4 border border-[#d8dee5] bg-[#fbfcfd] p-4 dark:border-[#30353a] dark:bg-[#131619]">
          {selectedUser ? (
            <>
              <div>
                <h3 className="text-sm font-semibold">
                  {t("Профиль пользователя", "User profile")}
                </h3>
                <div className="mt-3 grid gap-2 text-sm">
                  <UserProfileFact label="Email" value={selectedUser.email} />
                  <UserProfileFact
                    label={t("Имя", "Name")}
                    value={
                      selectedUser.displayName ??
                      t("Не указано", "Not specified")
                    }
                  />
                  <UserProfileFact
                    label={t("Роль", "Role")}
                    value={formatManagedUserRole(selectedUser)}
                  />
                  <UserProfileFact
                    label={t("Статус", "Status")}
                    value={formatManagedUserStatus(selectedUser)}
                  />
                  <UserProfileFact
                    label={t("Создан", "Created")}
                    value={formatDateTime(selectedUser.createdAt)}
                  />
                  {selectedUser.deactivatedAt ? (
                    <UserProfileFact
                      label={t("Деактивирован", "Deactivated")}
                      value={formatDateTime(selectedUser.deactivatedAt)}
                    />
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 border-t border-[#d8dee5] pt-4 dark:border-[#30353a]">
                <h3 className="text-sm font-semibold">
                  {t("Восстановление пароля", "Reset password")}
                </h3>
                <SettingsField
                  label={t("Срок действия, дней", "Validity, days")}
                >
                  <Input
                    className={settingsInputClassName}
                    disabled={!selectedUserActive}
                    max={30}
                    min={1}
                    required
                    type="number"
                    value={resetExpiresInDays}
                    onChange={(event) =>
                      setResetExpiresInDays(event.target.value)
                    }
                  />
                </SettingsField>
                <Button
                  disabled={!selectedUserActive || resetSaving}
                  type="button"
                  onClick={() => void handleCreatePasswordResetLink()}
                >
                  {resetSaving ? (
                    <IconLoader2 className="size-4 animate-spin" />
                  ) : (
                    <IconKey className="size-4" />
                  )}
                  {t(
                    "Создать ссылку восстановления",
                    "Create password reset link"
                  )}{" "}
                </Button>
              </div>

              <div className="grid gap-3 border-t border-[#d8dee5] pt-4 dark:border-[#30353a]">
                <h3 className="text-sm font-semibold">
                  {t("Доступ", "Access")}
                </h3>
                <Button
                  disabled={
                    selectedUser.role === "owner" ||
                    !selectedUserActive ||
                    deactivating
                  }
                  type="button"
                  variant="destructive"
                  onClick={() => void handleDeactivateUser()}
                >
                  {deactivating ? (
                    <IconLoader2 className="size-4 animate-spin" />
                  ) : (
                    <IconUserOff className="size-4" />
                  )}
                  {t("Деактивировать профиль", "Deactivate profile")}{" "}
                </Button>
                <p className="text-xs leading-5 text-[#68727d] dark:text-[#a7b0ba]">
                  {t(
                    "Деактивация закрывает вход и отзывает активные сессии. Почтовые ящики пользователя здесь не открываются.",
                    "Deactivation blocks sign-in and revokes active sessions. You cannot open this user's email accounts here."
                  )}{" "}
                </p>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-[#68727d] dark:text-[#a7b0ba]">
              {t(
                "Выбери пользователя из списка.",
                "Select a user from the list."
              )}{" "}
            </p>
          )}
        </section>
      </div>
      <Dialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
      >
        <DialogContent
          closeLabel={t("Закрыть", "Close")}
          className="sm:max-w-[440px]"
        >
          <DialogHeader>
            <DialogTitle>
              {t("Деактивировать профиль?", "Deactivate profile?")}
            </DialogTitle>
            <DialogDescription>
              {selectedUser
                ? t(
                    `Пользователь ${selectedUser.email} больше не сможет войти. Активные сессии будут отозваны.`,
                    `User ${selectedUser.email} will no longer be able to sign in. Active sessions will be revoked.`
                  )
                : t(
                    "Пользователь больше не сможет войти.",
                    "The user will no longer be able to sign in."
                  )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={deactivating}
              type="button"
              variant="ghost"
              onClick={() => setDeactivateDialogOpen(false)}
            >
              {t("Отмена", "Cancel")}{" "}
            </Button>
            <Button
              disabled={deactivating}
              type="button"
              variant="destructive"
              onClick={() => void confirmDeactivateUser()}
            >
              {deactivating ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconUserOff className="size-4" />
              )}
              {t("Деактивировать", "Deactivate")}{" "}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function UserProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 border border-[#e2e7eb] bg-white p-2 dark:border-[#2b3035] dark:bg-[#181b1f]">
      <span className="text-[11px] font-semibold text-[#68727d] dark:text-[#a7b0ba]">
        {label}
      </span>
      <span className="min-w-0 text-sm break-words text-[#20252a] dark:text-[#d7dde3]">
        {value}
      </span>
    </div>
  )
}

function getManagedUserTitle(user: ManagedUserDto) {
  return user.displayName?.trim() || user.email
}

function formatManagedUserRole(user: ManagedUserDto) {
  return user.role === "owner"
    ? mailText("Владелец", "Owner")
    : mailText("Пользователь", "User")
}

function formatManagedUserStatus(user: ManagedUserDto) {
  return user.deactivatedAt
    ? mailText("Деактивирован", "Deactivated")
    : mailText("Активен", "Active")
}

async function createRegistrationInvite(request: { expiresInDays: number }) {
  return apiFetch<CreateRegistrationInviteResponse>(
    "/api/auth/registration-invites",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }
  )
}

async function listManagedUsers() {
  return apiFetch<ListManagedUsersResponse>("/api/auth/users")
}

async function deactivateManagedUser(userId: string) {
  return apiFetch<DeactivateManagedUserResponse>(
    `/api/auth/users/${encodeURIComponent(userId)}/deactivate`,
    { method: "POST" }
  )
}

async function createPasswordResetLink(
  userId: string,
  request: { expiresInDays: number }
) {
  return apiFetch<CreatePasswordResetLinkResponse>(
    `/api/auth/users/${encodeURIComponent(userId)}/password-reset-links`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    }
  )
}

function buildRegistrationInviteUrl(token: string) {
  return `${window.location.origin}/register/${encodeURIComponent(token)}?lang=${getMailLocale()}`
}

function buildPasswordResetUrl(token: string) {
  return `${window.location.origin}/reset-password/${encodeURIComponent(token)}?lang=${getMailLocale()}`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(getMailIntlLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function getErrorMessage(error: unknown): UiMessage {
  return error instanceof Error
    ? error.message
    : ["Неизвестная ошибка", "Unknown error"]
}
