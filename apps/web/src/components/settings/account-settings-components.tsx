import { formatUiMessage, type UiMessage } from "../ui-message"
import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import IconCheck from "@tabler/icons-react/dist/esm/icons/IconCheck.mjs"
import IconChevronDown from "@tabler/icons-react/dist/esm/icons/IconChevronDown.mjs"
import IconDeviceFloppy from "@tabler/icons-react/dist/esm/icons/IconDeviceFloppy.mjs"
import IconExternalLink from "@tabler/icons-react/dist/esm/icons/IconExternalLink.mjs"
import IconInfoCircle from "@tabler/icons-react/dist/esm/icons/IconInfoCircle.mjs"
import IconKey from "@tabler/icons-react/dist/esm/icons/IconKey.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconPencil from "@tabler/icons-react/dist/esm/icons/IconPencil.mjs"
import IconPlus from "@tabler/icons-react/dist/esm/icons/IconPlus.mjs"
import IconTrash from "@tabler/icons-react/dist/esm/icons/IconTrash.mjs"
import IconX from "@tabler/icons-react/dist/esm/icons/IconX.mjs"
import type {
  ImapProvider,
  MailAccountDto,
  MailProfileDto,
} from "@/lib/api-client"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

import {
  deleteMailProfile,
  formatAccountStatus,
  getErrorMessage,
  getAccountInitials,
  getAccountLabel,
  pluralizeAccounts,
  getProviderGuides,
  settingsInputClassName,
  setsEqual,
  toggleSetValue,
  updateMailAccountName,
  updateMailProfile,
} from "./account-settings-model"
import { SettingsError, SettingsField } from "./settings-shared"

export function AccountSettingsItem({
  account,
  onUpdated,
}: {
  account: MailAccountDto
  onUpdated: (account: MailAccountDto) => void | Promise<void>
}) {
  const { t } = useMailLocale()

  const [editing, setEditing] = React.useState(false)
  const renameButtonRef = React.useRef<HTMLButtonElement>(null)
  const [label, setLabel] = React.useState(account.label ?? "")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<UiMessage | null>(null)
  const trimmedLabel = label.trim()
  const dirty = trimmedLabel !== (account.label ?? "")

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!dirty) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      const data = await updateMailAccountName(account.id, trimmedLabel)
      await onUpdated(data.account)
      setEditing(false)
      renameButtonRef.current?.focus()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="border-mail-border-subtle grid min-w-0 gap-4 border-b p-4 last:border-b-0 sm:px-5"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="bg-mail-canvas text-mail-text-muted grid size-10 shrink-0 place-items-center">
          {getAccountInitials(account)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold [overflow-wrap:anywhere]">
            {getAccountLabel(account)}
          </p>
          {getAccountLabel(account) !== account.address ? (
            <p className="text-mail-text-muted mt-0.5 text-xs [overflow-wrap:anywhere]">
              {account.address}
            </p>
          ) : null}
          <p className="text-mail-text-muted mt-1 text-xs leading-5 [overflow-wrap:anywhere]">
            {formatAccountStatus(account)}
          </p>
        </div>
        <Button
          ref={renameButtonRef}
          aria-label={t(
            `Изменить название ящика ${account.address}`,
            `Rename account ${account.address}`
          )}
          aria-expanded={editing}
          title={t("Изменить название", "Rename")}
          size="icon"
          disabled={saving}
          variant="ghost"
          type="button"
          onClick={() => {
            if (!editing) setLabel(account.label ?? "")
            setEditing((current) => !current)
          }}
        >
          <IconPencil className="size-4" />
        </Button>
      </div>
      {editing ? (
        <div className="grid min-w-0 gap-3 sm:pl-[52px]">
          <SettingsField label={t("Название ящика", "Account name")}>
            <Input
              autoFocus
              aria-label={t(
                `Название ящика ${account.address}`,
                `Account name ${account.address}`
              )}
              className={settingsInputClassName}
              placeholder={account.address}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </SettingsField>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              disabled={saving}
              type="button"
              variant="ghost"
              onClick={() => {
                setLabel(account.label ?? "")
                setError(null)
                setEditing(false)
                renameButtonRef.current?.focus()
              }}
            >
              {t("Отмена", "Cancel")}
            </Button>
            <Button disabled={!dirty || saving} type="submit">
              {saving ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconDeviceFloppy className="size-4" />
              )}
              {t("Сохранить", "Save")}
            </Button>
          </div>
          {error ? (
            <SettingsError>{formatUiMessage(error)}</SettingsError>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

export function ConnectionSettingsFields({
  host,
  legend,
  password,
  port,
  secure,
  username,
  onChange,
}: {
  host: string
  legend: string
  password: string
  port: string
  secure: boolean
  username: string
  onChange: (
    patch: Partial<{
      host: string
      password: string
      port: string
      secure: boolean
      username: string
    }>
  ) => void
}) {
  const { t } = useMailLocale()
  const secureCheckboxId = React.useId()

  return (
    <fieldset className="grid min-w-0 gap-3 border border-[#e2e7eb] bg-white p-3 dark:border-[#2b3035] dark:bg-[#181b1f]">
      <legend className="px-1 text-xs font-bold tracking-[0.12em] text-[#7a838c] uppercase dark:text-[#9ca6af]">
        {legend}
      </legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_88px]">
        <SettingsField label={t("Сервер", "Host")}>
          <Input
            className={settingsInputClassName}
            value={host}
            onChange={(event) => onChange({ host: event.target.value })}
          />
        </SettingsField>
        <SettingsField label={t("Порт", "Port")}>
          <Input
            className={settingsInputClassName}
            inputMode="numeric"
            value={port}
            onChange={(event) => onChange({ port: event.target.value })}
          />
        </SettingsField>
      </div>
      <SettingsField label={t("Логин", "Username")}>
        <Input
          autoComplete="username"
          className={settingsInputClassName}
          value={username}
          onChange={(event) => onChange({ username: event.target.value })}
        />
      </SettingsField>
      <SettingsField label={t("Пароль", "Password")}>
        <Input
          autoComplete="new-password"
          className={settingsInputClassName}
          type="password"
          value={password}
          onChange={(event) => onChange({ password: event.target.value })}
        />
      </SettingsField>
      <div className="relative flex items-center gap-2">
        <Checkbox
          checked={secure}
          id={secureCheckboxId}
          onCheckedChange={(checked) => onChange({ secure: checked === true })}
        />
        <Label
          className="text-xs font-semibold text-[#4c5661] dark:text-[#c4ccd4]"
          htmlFor={secureCheckboxId}
        >
          TLS
        </Label>
      </div>
    </fieldset>
  )
}

export function ProviderGuidePanel({ provider }: { provider: ImapProvider }) {
  const { t } = useMailLocale()

  if (provider === "custom") {
    return (
      <div className="flex items-start gap-2 border-l-2 border-[#9aa6b2] bg-[#eef2f5] px-3 py-2 text-sm text-[#4c5661] dark:border-[#5d6873] dark:bg-[#20252a] dark:text-[#c4ccd4]">
        <IconInfoCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          {t(
            "Для ручного IMAP укажи серверы провайдера и пароль, который он разрешает использовать в почтовых клиентах.",
            "For custom IMAP, enter your provider's servers and a password allowed for email clients."
          )}{" "}
        </p>
      </div>
    )
  }

  const guide = getProviderGuides()[provider]

  return (
    <div className="grid min-w-0 gap-3 border-l-2 border-[#1f8a70] bg-[#f0f7f4] px-3 py-3 text-sm text-[#304137] dark:border-[#37b391] dark:bg-[#17231f] dark:text-[#c7e6da]">
      <div className="flex items-center gap-2 font-semibold text-[#203129] dark:text-[#e4f4ee]">
        <IconKey className="size-4 shrink-0" />
        {guide.title}
        {t(": пароль приложения", ": app password")}{" "}
      </div>
      <ol className="grid gap-1 pl-5 text-[#405449] dark:text-[#b8d4ca]">
        {guide.steps.map((step) => (
          <li className="list-decimal" key={step}>
            {step}
          </li>
        ))}
      </ol>
      {guide.note ? (
        <p className="text-xs text-[#5a6f64] dark:text-[#9fc1b3]">
          {guide.note}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
        {guide.links.map((link) => (
          <a
            className="focus-visible:outline-mail-accent inline-flex items-center gap-1 text-xs font-semibold text-[#146c57] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:text-[#78d9ba]"
            href={link.href}
            key={link.href}
            rel="noreferrer"
            target="_blank"
          >
            {link.label}
            <IconExternalLink className="size-3.5" />
          </a>
        ))}
      </div>
    </div>
  )
}

export function AccountChips({
  accounts,
  selectedAccountIds,
  onToggle,
}: {
  accounts: MailAccountDto[]
  selectedAccountIds: Set<string>
  onToggle: (accountId: string) => void
}) {
  const { t } = useMailLocale()

  const [pickerOpen, setPickerOpen] = React.useState(false)
  const pickerRef = React.useRef<HTMLDivElement | null>(null)

  const selected = accounts.filter((account) =>
    selectedAccountIds.has(account.id)
  )
  const available = accounts.filter(
    (account) => !selectedAccountIds.has(account.id)
  )

  React.useEffect(() => {
    if (!pickerOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (!pickerRef.current) {
        return
      }

      if (!pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false)
      }
    }

    document.addEventListener("mousedown", handlePointerDown)
    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [pickerOpen])

  if (accounts.length === 0) {
    return (
      <p className="border border-[#e2e7eb] bg-white p-3 text-sm text-[#68727d] dark:border-[#2b3035] dark:bg-[#181b1f] dark:text-[#a7b0ba]">
        {t(
          "Ящиков нет. Добавь ящик во вкладке «Ящики».",
          "No accounts. Add an account in the Accounts tab."
        )}{" "}
      </p>
    )
  }

  return (
    <div className="grid gap-2">
      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((account) => (
            <span
              className="inline-flex items-center gap-1.5 border border-[#cfd6dd] bg-[#eef2f5] py-1 pr-1 pl-1.5 text-xs font-medium text-[#20252a] dark:border-[#3a424b] dark:bg-[#20252a] dark:text-[#eef2f4]"
              key={account.id}
            >
              <AccountBadge account={account} />
              <span className="max-w-[180px] truncate">
                {getAccountLabel(account)}
              </span>
              <button
                aria-label={t(
                  `Убрать ${getAccountLabel(account)}`,
                  `Remove ${getAccountLabel(account)}`
                )}
                className="grid size-4 place-items-center text-[#68727d] transition hover:text-[#963828] dark:text-[#a7b0ba] dark:hover:text-[#ffb3a7]"
                type="button"
                onClick={() => onToggle(account.id)}
              >
                <IconX className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-[#68727d] dark:text-[#a7b0ba]">
          {t("Ящики не выбраны", "No accounts selected")}{" "}
        </p>
      )}

      {available.length > 0 ? (
        <div className="relative" ref={pickerRef}>
          <button
            aria-expanded={pickerOpen}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#146c57] transition hover:underline dark:text-[#78d9ba]"
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
          >
            <IconPlus className="size-3.5" />
            {t("Добавить ящик", "Add account")}{" "}
          </button>
          {pickerOpen ? (
            <div className="absolute top-full left-0 z-10 mt-1 max-w-[320px] min-w-[220px] border border-[#d8dee5] bg-white py-1 shadow-[0_8px_24px_rgba(15,23,42,0.18)] dark:border-[#30353a] dark:bg-[#181b1f]">
              {available.map((account) => (
                <button
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition hover:bg-[#f5f7f9] dark:hover:bg-[#23282d]"
                  key={account.id}
                  type="button"
                  onClick={() => {
                    onToggle(account.id)
                    setPickerOpen(false)
                  }}
                >
                  <AccountBadge account={account} />
                  <span className="min-w-0 flex-1 truncate">
                    {getAccountLabel(account)}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function ProfileAccordionItem({
  accounts,
  expanded,
  profile,
  onToggleExpand,
  onChanged,
}: {
  accounts: MailAccountDto[]
  expanded: boolean
  profile: MailProfileDto
  onToggleExpand: () => void
  onChanged: () => Promise<void>
}) {
  const { t, intlLocale } = useMailLocale()

  const selectedAccounts = accounts.filter((account) =>
    profile.accountIds.includes(account.id)
  )

  return (
    <div className="border border-[#e2e7eb] bg-white dark:border-[#2b3035] dark:bg-[#181b1f]">
      <button
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-[#f5f7f9] dark:hover:bg-[#1d2125]"
        type="button"
        onClick={onToggleExpand}
      >
        <IconChevronDown
          className={cn(
            "size-4 shrink-0 text-[#68727d] transition dark:text-[#a7b0ba]",
            expanded ? "" : "-rotate-90"
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#20252a] dark:text-[#eef2f4]">
            {profile.name}
          </p>
          <p className="truncate text-xs text-[#68727d] dark:text-[#a7b0ba]">
            {selectedAccounts.length === 0
              ? t("Ящиков нет", "No accounts")
              : `${new Intl.NumberFormat(intlLocale).format(selectedAccounts.length)} ${pluralizeAccounts(selectedAccounts.length)}`}
          </p>
        </div>
        {selectedAccounts.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1">
            {selectedAccounts.slice(0, 3).map((account) => (
              <AccountBadge account={account} key={account.id} />
            ))}
            {selectedAccounts.length > 3 ? (
              <span className="text-xs font-semibold text-[#68727d] dark:text-[#a7b0ba]">
                +{selectedAccounts.length - 3}
              </span>
            ) : null}
          </div>
        ) : null}
      </button>
      {expanded ? (
        <ProfileEditorExpanded
          accounts={accounts}
          key={`${profile.id}:${profile.name}:${profile.accountIds.join(",")}`}
          profile={profile}
          onChanged={onChanged}
        />
      ) : null}
    </div>
  )
}

function ProfileEditorExpanded({
  accounts,
  profile,
  onChanged,
}: {
  accounts: MailAccountDto[]
  profile: MailProfileDto
  onChanged: () => Promise<void>
}) {
  const { t } = useMailLocale()

  const [name, setName] = React.useState(profile.name)
  const [accountIds, setAccountIds] = React.useState<Set<string>>(
    () => new Set(profile.accountIds)
  )
  const [saving, setSaving] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [error, setError] = React.useState<UiMessage | null>(null)

  const isDirty =
    name !== profile.name || !setsEqual(accountIds, new Set(profile.accountIds))

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      await updateMailProfile(profile.id, {
        name,
        accountIds: [...accountIds],
      })
      await onChanged()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)

    try {
      await deleteMailProfile(profile.id)
      await onChanged()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
    } finally {
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  function handleReset() {
    setName(profile.name)
    setAccountIds(new Set(profile.accountIds))
    setError(null)
  }

  return (
    <form
      className="grid gap-3 border-t border-[#e2e7eb] p-3 dark:border-[#2b3035]"
      onSubmit={(event) => void handleSave(event)}
    >
      <SettingsField label={t("Название", "Name")}>
        <Input
          className={settingsInputClassName}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </SettingsField>
      <div className="grid gap-1.5">
        <span className="text-xs font-semibold text-[#4c5661] dark:text-[#c4ccd4]">
          {t("Ящики", "Accounts")}{" "}
        </span>
        <AccountChips
          accounts={accounts}
          selectedAccountIds={accountIds}
          onToggle={(accountId) =>
            setAccountIds((currentIds) => toggleSetValue(currentIds, accountId))
          }
        />
      </div>
      {error ? <SettingsError>{formatUiMessage(error)}</SettingsError> : null}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          {confirmingDelete ? (
            <>
              <span className="text-xs text-[#68727d] dark:text-[#a7b0ba]">
                {t("Удалить?", "Delete?")}{" "}
              </span>
              <Button
                disabled={deleting || saving}
                size="sm"
                type="button"
                variant="destructive"
                onClick={() => void handleDelete()}
              >
                {deleting ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : (
                  <IconCheck className="size-4" />
                )}
                {t("Да", "Yes")}{" "}
              </Button>
              <Button
                disabled={deleting || saving}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setConfirmingDelete(false)}
              >
                {t("Нет", "No")}{" "}
              </Button>
            </>
          ) : (
            <Button
              disabled={saving || deleting}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setConfirmingDelete(true)}
            >
              <IconTrash className="size-4" />
              {t("Удалить", "Delete")}{" "}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDirty ? (
            <Button
              disabled={saving || deleting}
              size="sm"
              type="button"
              variant="ghost"
              onClick={handleReset}
            >
              {t("Отмена", "Cancel")}{" "}
            </Button>
          ) : null}
          <Button
            disabled={!isDirty || saving || deleting}
            size="sm"
            type="submit"
          >
            {saving ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconCheck className="size-4" />
            )}
            {t("Сохранить", "Save")}{" "}
          </Button>
        </div>
      </div>
    </form>
  )
}

function AccountBadge({ account }: { account: MailAccountDto }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center border border-[#cfd6dd] bg-[#eef2f5] text-[10px] font-semibold text-[#4c5661] dark:border-[#3a424b] dark:bg-[#20252a] dark:text-[#d7dde3]">
      {getAccountInitials(account)}
    </span>
  )
}
