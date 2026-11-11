import { formatUiMessage, type UiMessage } from "./ui-message"
import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { normalizeMailRouteSearch } from "@/lib/mail-route-state"
import { MailAppearanceSettings } from "@workspace/mail-design"
import { MailSettingsSurface } from "@workspace/mail-design/settings"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconLogout from "@tabler/icons-react/dist/esm/icons/IconLogout.mjs"
import IconPlus from "@tabler/icons-react/dist/esm/icons/IconPlus.mjs"
import IconArrowLeft from "@tabler/icons-react/dist/esm/icons/IconArrowLeft.mjs"
import IconTrash from "@tabler/icons-react/dist/esm/icons/IconTrash.mjs"
import {
  type ImapProvider,
  type MailAccountDto,
  type MailPreferencesDto,
  type MailProfileDto,
} from "@/lib/api-client"
import {
  type OfflineMailCacheSettings,
  type OfflineMailCacheStatus,
} from "@/lib/offline-mail-cache"
import type { MailtoHandlerRegistrationOutcome } from "@/lib/mailto-protocol-handler"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import {
  ApplicationSettingsPanel,
  OfflineCacheSettingsPanel,
} from "./settings/application-settings"
import {
  SettingsError,
  SettingsField,
  SettingsSelectField,
} from "./settings/settings-shared"
import { SettingsNavigation } from "./settings/settings-navigation"
import type { SettingsRouteTab } from "@/lib/mail-route-state"
import { SignatureSettingsPanel } from "./settings/signature-settings"
import { UserManagementSettingsPanel } from "./settings/user-management-settings"
import {
  AccountChips,
  AccountSettingsItem,
  ConnectionSettingsFields,
  ProfileAccordionItem,
  ProviderGuidePanel,
} from "./settings/account-settings-components"
import {
  applyProviderPreset,
  buildConnectImapAccountRequest,
  connectImapAccount,
  createEmptyAccountForm,
  createMailProfile,
  getAccountConnectionErrorMessage,
  getErrorMessage,
  prefixPatch,
  getProviderOptions,
  settingsInputClassName,
  settingsSelectTriggerClassName,
  toggleSetValue,
  type AccountFormState,
} from "./settings/account-settings-model"

export function SettingsPanel({
  accounts,
  applicationOrigin,
  canManageUsers,
  activeTab,
  mailPreferences,
  mailtoRegistrationAvailable,
  offlineCacheSettings,
  offlineCacheStatus,
  pwaInstallAvailable,
  pwaInstalled,
  profiles,
  profilesLoading,
  onClose,
  onTabChange,
  onAccountCreated,
  onAccountUpdated,
  onClearOfflineCache,
  onLogout,
  onMailPreferencesChange,
  onInstallPwa,
  onRegisterMailtoHandler,
  onOfflineCacheSettingsChange,
  onProfilesChanged,
}: {
  accounts: MailAccountDto[]
  applicationOrigin: string
  canManageUsers: boolean
  activeTab: SettingsRouteTab
  mailPreferences: MailPreferencesDto
  mailtoRegistrationAvailable: boolean
  offlineCacheSettings: OfflineMailCacheSettings
  offlineCacheStatus: OfflineMailCacheStatus | null
  pwaInstallAvailable: boolean
  pwaInstalled: boolean
  profiles: MailProfileDto[]
  profilesLoading: boolean
  onClose: () => void
  onTabChange: (tab: SettingsRouteTab, replace?: boolean) => void
  onAccountCreated: () => Promise<void>
  onAccountUpdated: (account: MailAccountDto) => void | Promise<void>
  onClearOfflineCache: () => Promise<void>
  onLogout: () => void | Promise<void>
  onMailPreferencesChange: (
    preferences: MailPreferencesDto
  ) => MailPreferencesDto
  onInstallPwa: () => Promise<"accepted" | "dismissed" | "unavailable">
  onRegisterMailtoHandler: () => MailtoHandlerRegistrationOutcome
  onOfflineCacheSettingsChange: (
    settings: OfflineMailCacheSettings
  ) => Promise<void>
  onProfilesChanged: () => Promise<void>
}) {
  const { t } = useMailLocale()
  const router = useRouter()

  const [accountForm, setAccountForm] = React.useState<AccountFormState>(() =>
    createEmptyAccountForm()
  )
  const addAccountButtonRef = React.useRef<HTMLButtonElement>(null)
  const accountListScrollRef = React.useRef(0)
  const previousTabRef = React.useRef(activeTab)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const sectionTitleRef = React.useRef<HTMLHeadingElement>(null)
  const [accountSaving, setAccountSaving] = React.useState(false)
  const [accountError, setAccountError] = React.useState<UiMessage | null>(null)
  const [profileName, setProfileName] = React.useState("")
  const [profileAccountIds, setProfileAccountIds] = React.useState<Set<string>>(
    () => new Set()
  )
  const [profileSaving, setProfileSaving] = React.useState(false)
  const [profileError, setProfileError] = React.useState<UiMessage | null>(null)
  const [expandedProfileId, setExpandedProfileId] = React.useState<
    string | null
  >(null)
  const [offlineFormState, setOfflineFormState] = React.useState(() => ({
    settings: offlineCacheSettings,
    source: offlineCacheSettings,
  }))
  const [offlineSaving, setOfflineSaving] = React.useState(false)
  const [offlineClearing, setOfflineClearing] = React.useState(false)
  const [offlineError, setOfflineError] = React.useState<UiMessage | null>(null)
  const [clearOfflineCacheDialogOpen, setClearOfflineCacheDialogOpen] =
    React.useState(false)
  const titleId = React.useId()
  const offlineForm =
    offlineFormState.source === offlineCacheSettings
      ? offlineFormState.settings
      : offlineCacheSettings
  const visibleActiveTab =
    activeTab === "users" && !canManageUsers ? "accounts" : activeTab

  const addingAccount = visibleActiveTab === "add-account"

  React.useLayoutEffect(() => {
    const returningToAccounts = visibleActiveTab === "accounts"
    contentRef.current?.scrollTo({
      top: returningToAccounts ? accountListScrollRef.current : 0,
    })
    if (returningToAccounts && previousTabRef.current === "add-account") {
      addAccountButtonRef.current?.focus({ preventScroll: true })
    } else {
      sectionTitleRef.current?.focus({ preventScroll: true })
    }
    previousTabRef.current = visibleActiveTab
  }, [visibleActiveTab])

  function cancelAccountCreation() {
    setAccountForm(createEmptyAccountForm(accountForm.provider))
    setAccountError(null)
    onTabChange("accounts", true)
  }

  function setOfflineForm(
    action: React.SetStateAction<OfflineMailCacheSettings>
  ) {
    setOfflineFormState((currentState) => {
      const currentSettings =
        currentState.source === offlineCacheSettings
          ? currentState.settings
          : offlineCacheSettings
      const settings =
        typeof action === "function" ? action(currentSettings) : action

      return {
        settings,
        source: offlineCacheSettings,
      }
    })
  }

  function updateAccountForm(patch: Partial<AccountFormState>) {
    setAccountForm((currentForm) => ({
      ...currentForm,
      ...patch,
    }))
  }

  function updateAccountAddress(address: string) {
    setAccountForm((currentForm) => ({
      ...currentForm,
      address,
      imapUsername:
        currentForm.imapUsername === "" ||
        currentForm.imapUsername === currentForm.address
          ? address
          : currentForm.imapUsername,
      smtpUsername:
        currentForm.smtpUsername === "" ||
        currentForm.smtpUsername === currentForm.address
          ? address
          : currentForm.smtpUsername,
    }))
  }

  function updateProvider(provider: ImapProvider) {
    setAccountForm((currentForm) =>
      applyProviderPreset({
        ...currentForm,
        provider,
      })
    )
  }

  async function handleAccountSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (accountSaving) return
    setAccountSaving(true)
    setAccountError(null)

    try {
      const request = buildConnectImapAccountRequest(accountForm)
      await connectImapAccount(request)
      await onAccountCreated()
      setAccountForm(createEmptyAccountForm(accountForm.provider))
      // A completed connection must not pull the user out of another section.
      if (
        normalizeMailRouteSearch(router.state.location.search).settings ===
        "add-account"
      ) {
        onTabChange("accounts", true)
      }
    } catch (error) {
      setAccountError(getAccountConnectionErrorMessage(error))
    } finally {
      setAccountSaving(false)
    }
  }

  async function handleCreateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProfileSaving(true)
    setProfileError(null)

    try {
      const result = await createMailProfile({
        name: profileName,
        accountIds: [...profileAccountIds],
      })
      setProfileName("")
      setProfileAccountIds(new Set())
      setExpandedProfileId(result.profile.id)
      await onProfilesChanged()
    } catch (error) {
      setProfileError(getErrorMessage(error))
    } finally {
      setProfileSaving(false)
    }
  }

  async function handleOfflineSettingsSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()
    setOfflineSaving(true)
    setOfflineError(null)

    try {
      await onOfflineCacheSettingsChange(offlineForm)
    } catch (error) {
      setOfflineError(getErrorMessage(error))
    } finally {
      setOfflineSaving(false)
    }
  }

  function handleClearOfflineCache() {
    setClearOfflineCacheDialogOpen(true)
  }

  async function confirmClearOfflineCache() {
    setOfflineClearing(true)
    setOfflineError(null)

    try {
      await onClearOfflineCache()
      setClearOfflineCacheDialogOpen(false)
    } catch (error) {
      setOfflineError(getErrorMessage(error))
    } finally {
      setOfflineClearing(false)
    }
  }

  return (
    <>
      <MailSettingsSurface titleId={titleId}>
        <header className="border-mail-border bg-mail-panel flex min-h-16 shrink-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Button type="button" variant="ghost" onClick={onClose}>
              <IconArrowLeft className="size-4" />
              {t("К почте", "Back to mail")}
            </Button>
            <h1
              className="min-w-0 truncate text-base font-semibold"
              id={titleId}
            >
              {t("Настройки", "Settings")}
            </h1>
          </div>
          <Button
            aria-label={t("Выйти", "Sign out")}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => void onLogout()}
          >
            <IconLogout className="size-4" />
            <span className="hidden sm:inline">{t("Выйти", "Sign out")}</span>
          </Button>
        </header>
        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col md:flex-row">
          <SettingsNavigation
            activeTab={addingAccount ? "accounts" : visibleActiveTab}
            canManageUsers={canManageUsers}
          />
          <div
            ref={contentRef}
            onScroll={(event) => {
              if (visibleActiveTab === "accounts")
                accountListScrollRef.current = event.currentTarget.scrollTop
            }}
            className="custom-scrollbar relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div className="@container/settings mx-auto w-full max-w-[1080px] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
              {addingAccount ? (
                <Button
                  className="mb-3 -ml-3"
                  type="button"
                  variant="ghost"
                  onClick={() => onTabChange("accounts", true)}
                >
                  <IconArrowLeft className="size-4" />
                  {t("К ящикам", "Back to accounts")}
                </Button>
              ) : null}
              <h2
                ref={sectionTitleRef}
                tabIndex={-1}
                className="mb-6 text-2xl font-semibold tracking-tight outline-none"
              >
                {
                  {
                    accounts: t("Ящики", "Accounts"),
                    "add-account": t("Добавить ящик", "Add account"),
                    profiles: t("Профили", "Profiles"),
                    signatures: t("Подпись", "Signature"),
                    users: t("Пользователи", "Users"),
                    appearance: t("Внешний вид", "Appearance"),
                    offline: t("Офлайн", "Offline"),
                    application: t("Приложение", "Application"),
                  }[visibleActiveTab]
                }
              </h2>
              {visibleActiveTab === "accounts" || addingAccount ? (
                <div className="grid min-w-0 gap-6">
                  <section
                    hidden={addingAccount}
                    className="border-mail-border bg-mail-panel hidden:hidden min-w-0 border"
                  >
                    <div className="border-mail-border flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:px-5">
                      <h3 className="text-sm font-semibold">
                        {t("Подключённые ящики", "Connected accounts")}
                        <span className="text-mail-text-muted ml-2 font-normal">
                          {accounts.length}
                        </span>
                      </h3>
                      <Button
                        ref={addAccountButtonRef}
                        type="button"
                        onClick={() => onTabChange("add-account")}
                      >
                        <IconPlus className="size-4" />
                        {t("Добавить ящик", "Add account")}
                      </Button>
                    </div>
                    <div className="min-w-0">
                      {accounts.length === 0 ? (
                        <p className="py-6 text-center text-sm text-[#68727d] dark:text-[#a7b0ba]">
                          {t("Ящиков нет", "No accounts")}{" "}
                        </p>
                      ) : (
                        accounts.map((account) => (
                          <AccountSettingsItem
                            account={account}
                            key={account.id}
                            onUpdated={onAccountUpdated}
                          />
                        ))
                      )}
                    </div>
                  </section>

                  <form
                    id="add-account-form"
                    hidden={!addingAccount}
                    aria-busy={accountSaving}
                    className="border-mail-border bg-mail-panel hidden:hidden @container/account grid min-w-0 scroll-mt-6 gap-6 border p-4 sm:p-6"
                    onSubmit={(event) => void handleAccountSubmit(event)}
                  >
                    <fieldset
                      disabled={accountSaving}
                      className="grid min-w-0 gap-6"
                    >
                      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                        <SettingsSelectField label={t("Провайдер", "Provider")}>
                          <Select
                            value={accountForm.provider}
                            onValueChange={(value) =>
                              updateProvider(value as ImapProvider)
                            }
                          >
                            <SelectTrigger
                              className={settingsSelectTriggerClassName}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {getProviderOptions().map((providerOption) => (
                                <SelectItem
                                  key={providerOption.value}
                                  value={providerOption.value}
                                >
                                  {providerOption.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </SettingsSelectField>
                        <SettingsField label="Email">
                          <Input
                            autoComplete="email"
                            type="email"
                            required
                            className={settingsInputClassName}
                            placeholder="mail@example.com"
                            value={accountForm.address}
                            onChange={(event) =>
                              updateAccountAddress(event.target.value)
                            }
                          />
                        </SettingsField>
                        <SettingsField
                          label={t("Имя отправителя", "Sender name")}
                        >
                          <Input
                            className={settingsInputClassName}
                            value={accountForm.displayName}
                            onChange={(event) =>
                              updateAccountForm({
                                displayName: event.target.value,
                              })
                            }
                          />
                        </SettingsField>
                      </div>

                      <ProviderGuidePanel provider={accountForm.provider} />

                      <div className="grid min-w-0 gap-5 @3xl/account:grid-cols-2">
                        <ConnectionSettingsFields
                          host={accountForm.imapHost}
                          legend="IMAP"
                          password={accountForm.imapPassword}
                          port={accountForm.imapPort}
                          secure={accountForm.imapSecure}
                          username={accountForm.imapUsername}
                          onChange={(patch) =>
                            updateAccountForm(prefixPatch("imap", patch))
                          }
                        />
                        <ConnectionSettingsFields
                          host={accountForm.smtpHost}
                          legend="SMTP"
                          password={accountForm.smtpPassword}
                          port={accountForm.smtpPort}
                          secure={accountForm.smtpSecure}
                          username={accountForm.smtpUsername}
                          onChange={(patch) =>
                            updateAccountForm(prefixPatch("smtp", patch))
                          }
                        />
                      </div>

                      {accountError ? (
                        <SettingsError>
                          {formatUiMessage(accountError)}
                        </SettingsError>
                      ) : null}

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          disabled={accountSaving}
                          type="button"
                          variant="ghost"
                          onClick={cancelAccountCreation}
                        >
                          {t("Отмена", "Cancel")}
                        </Button>
                        <Button disabled={accountSaving} type="submit">
                          {accountSaving ? (
                            <IconLoader2 className="size-4 animate-spin" />
                          ) : (
                            <IconPlus className="size-4" />
                          )}
                          {accountSaving
                            ? t("Подключаю ящик", "Connecting account")
                            : t("Добавить ящик", "Add account")}
                        </Button>
                      </div>
                    </fieldset>
                  </form>
                </div>
              ) : visibleActiveTab === "profiles" ? (
                <div className="grid min-w-0 gap-6 @3xl/settings:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <form
                    className="grid content-start gap-4 border border-[#d8dee5] bg-[#fbfcfd] p-4 dark:border-[#30353a] dark:bg-[#131619]"
                    onSubmit={(event) => void handleCreateProfile(event)}
                  >
                    <h3 className="text-sm font-semibold">
                      {t("Новый профиль", "New profile")}
                    </h3>
                    <SettingsField label={t("Название", "Name")}>
                      <Input
                        className={settingsInputClassName}
                        placeholder={t("Например, Работа", "For example, Work")}
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                      />
                    </SettingsField>
                    <div className="grid gap-1.5">
                      <span className="text-xs font-semibold text-[#4c5661] dark:text-[#c4ccd4]">
                        {t("Ящики", "Accounts")}{" "}
                      </span>
                      <AccountChips
                        accounts={accounts}
                        selectedAccountIds={profileAccountIds}
                        onToggle={(accountId) =>
                          setProfileAccountIds((currentIds) =>
                            toggleSetValue(currentIds, accountId)
                          )
                        }
                      />
                    </div>
                    {profileError ? (
                      <SettingsError>
                        {formatUiMessage(profileError)}
                      </SettingsError>
                    ) : null}
                    <Button disabled={profileSaving} type="submit">
                      {profileSaving ? (
                        <IconLoader2 className="size-4 animate-spin" />
                      ) : (
                        <IconPlus className="size-4" />
                      )}
                      {t("Создать", "Create")}{" "}
                    </Button>
                  </form>

                  <section className="min-w-0 border border-[#d8dee5] bg-[#fbfcfd] p-4 dark:border-[#30353a] dark:bg-[#131619]">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">
                        {t("Профили", "Profiles")}
                      </h3>
                      {profilesLoading ? (
                        <IconLoader2 className="size-4 animate-spin text-[#68727d]" />
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      {profiles.length === 0 ? (
                        <p className="py-10 text-center text-sm text-[#68727d] dark:text-[#a7b0ba]">
                          {t("Профилей нет", "No profiles")}{" "}
                        </p>
                      ) : (
                        profiles.map((profile) => (
                          <ProfileAccordionItem
                            accounts={accounts}
                            expanded={expandedProfileId === profile.id}
                            key={profile.id}
                            profile={profile}
                            onToggleExpand={() =>
                              setExpandedProfileId((currentId) =>
                                currentId === profile.id ? null : profile.id
                              )
                            }
                            onChanged={onProfilesChanged}
                          />
                        ))
                      )}
                    </div>
                  </section>
                </div>
              ) : visibleActiveTab === "signatures" ? (
                <SignatureSettingsPanel
                  accounts={accounts}
                  mailPreferences={mailPreferences}
                  onMailPreferencesChange={onMailPreferencesChange}
                />
              ) : visibleActiveTab === "users" && canManageUsers ? (
                <UserManagementSettingsPanel />
              ) : visibleActiveTab === "appearance" ? (
                <MailAppearanceSettings />
              ) : visibleActiveTab === "offline" ? (
                <OfflineCacheSettingsPanel
                  clearing={offlineClearing}
                  error={formatUiMessage(offlineError)}
                  saving={offlineSaving}
                  settings={offlineForm}
                  status={offlineCacheStatus}
                  onChange={setOfflineForm}
                  onClear={() => void handleClearOfflineCache()}
                  onSubmit={(event) => void handleOfflineSettingsSubmit(event)}
                />
              ) : (
                <ApplicationSettingsPanel
                  applicationOrigin={applicationOrigin}
                  installAvailable={pwaInstallAvailable}
                  installed={pwaInstalled}
                  mailtoRegistrationAvailable={mailtoRegistrationAvailable}
                  onInstall={onInstallPwa}
                  onRegisterMailtoHandler={onRegisterMailtoHandler}
                />
              )}
            </div>
          </div>
        </div>
      </MailSettingsSurface>
      <Dialog
        open={clearOfflineCacheDialogOpen}
        onOpenChange={setClearOfflineCacheDialogOpen}
      >
        <DialogContent
          closeLabel={t("Закрыть", "Close")}
          className="sm:max-w-[420px]"
        >
          <DialogHeader>
            <DialogTitle>
              {t("Очистить локальный кэш?", "Clear local cache?")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "Локально сохраненные письма будут удалены с этого устройства.",
                "Messages stored locally will be removed from this device."
              )}{" "}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              disabled={offlineClearing}
              type="button"
              variant="ghost"
              onClick={() => setClearOfflineCacheDialogOpen(false)}
            >
              {t("Отмена", "Cancel")}{" "}
            </Button>
            <Button
              disabled={offlineClearing}
              type="button"
              variant="destructive"
              onClick={() => void confirmClearOfflineCache()}
            >
              {offlineClearing ? (
                <IconLoader2 className="size-4 animate-spin" />
              ) : (
                <IconTrash className="size-4" />
              )}
              {t("Очистить", "Clear")}{" "}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
