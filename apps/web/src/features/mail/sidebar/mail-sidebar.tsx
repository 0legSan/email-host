import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import IconChevronDown from "@tabler/icons-react/dist/esm/icons/IconChevronDown.mjs"
import IconChevronRight from "@tabler/icons-react/dist/esm/icons/IconChevronRight.mjs"
import IconFolder from "@tabler/icons-react/dist/esm/icons/IconFolder.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconRefresh from "@tabler/icons-react/dist/esm/icons/IconRefresh.mjs"
import IconSettings from "@tabler/icons-react/dist/esm/icons/IconSettings.mjs"
import IconX from "@tabler/icons-react/dist/esm/icons/IconX.mjs"
import {
  MailboxIcon,
  MailSidebarFrame,
  MailSidebarHeader,
  MailSidebarSectionLabel,
  MailThemeToggle as ThemeToggle,
} from "@workspace/mail-design"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import {
  mailSections,
  standardSpecialUses,
  type MailSection,
} from "@/features/mail/model/mail-sections"
import {
  getProfileAccountDragKey,
  getProfileAccountDropPosition,
  getRootDropPosition,
  getSidebarOrderableItemKey,
  renderDropIndicator,
  sortSidebarOrderableItems,
  useSidebarDnd,
  type SidebarOrderableItem,
} from "@/features/mail/sidebar/sidebar-dnd"
import {
  compactNumber,
  findSpecialMailbox,
  formatMailboxName,
  getMailAccountLabel,
  sumSpecialMailboxUnreadCount,
} from "@/features/mail/utils/mail-format"
import type {
  MailAccountDto,
  MailboxDto,
  MailProfileDto,
  MailSidebarOrderItem,
} from "@/lib/api-client"

export const MailSidebar = React.memo(function MailSidebar({
  accounts,
  accountsLoading,
  customFoldersOnly,
  expandedSections,
  flaggedOnly,
  mailboxesByAccount,
  mailboxesLoading,
  mobileSidebarOpen,
  sidebarOrder,
  profiles,
  profilesLoading,
  selectedAccountId,
  selectedMailboxPath,
  selectedProfileId,
  selectedSpecialUse,
  settingsOpen,
  closeMobileSidebar,
  invalidateMailCaches,
  loadAccounts,
  loadProfiles,
  preloadSettingsPanel,
  saveProfileAccountOrder,
  saveSidebarOrder,
  selectAccountMailbox,
  selectCustomFolders,
  selectFlaggedAccount,
  selectProfileSection,
  selectSection,
  onOpenSettings,
  toggleSection,
}: {
  accounts: MailAccountDto[]
  accountsLoading: boolean
  customFoldersOnly: boolean
  expandedSections: Record<string, boolean>
  flaggedOnly: boolean
  mailboxesByAccount: Record<string, MailboxDto[]>
  mailboxesLoading: boolean
  mobileSidebarOpen: boolean
  sidebarOrder: MailSidebarOrderItem[]
  profiles: MailProfileDto[]
  profilesLoading: boolean
  selectedAccountId: string | null
  selectedMailboxPath: string | null
  selectedProfileId: string | null
  selectedSpecialUse: string | null
  settingsOpen: boolean
  closeMobileSidebar: () => void
  invalidateMailCaches: () => void
  loadAccounts: (options?: { force?: boolean }) => Promise<void>
  loadProfiles: (options?: { force?: boolean }) => Promise<void>
  preloadSettingsPanel: () => void
  saveProfileAccountOrder: (
    profileId: string,
    accountIds: string[]
  ) => void | Promise<void>
  saveSidebarOrder: (order: MailSidebarOrderItem[]) => void | Promise<void>
  selectAccountMailbox: (accountId: string, mailboxPath: string) => void
  selectCustomFolders: () => void
  selectFlaggedAccount: (accountId: string) => void
  selectProfileSection: (profileId: string, section: MailSection) => void
  selectSection: (section: MailSection) => void
  onOpenSettings: () => void
  toggleSection: (sectionId: string) => void
}) {
  const { t } = useMailLocale()

  const profiledAccountIds = React.useMemo(() => {
    const accountIds = new Set<string>()

    for (const profile of profiles) {
      for (const accountId of profile.accountIds) {
        accountIds.add(accountId)
      }
    }

    return accountIds
  }, [profiles])
  const unprofiledAccounts = React.useMemo(
    () => accounts.filter((account) => !profiledAccountIds.has(account.id)),
    [accounts, profiledAccountIds]
  )
  const accountById = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  )
  const orderedRootSidebarItems = React.useMemo(
    () =>
      sortSidebarOrderableItems(
        [
          ...profiles.map((profile) => ({
            type: "profile" as const,
            id: profile.id,
            profile,
          })),
          ...unprofiledAccounts.map((account) => ({
            type: "account" as const,
            id: account.id,
            account,
          })),
        ],
        sidebarOrder
      ),
    [profiles, sidebarOrder, unprofiledAccounts]
  )
  const customMailboxesByAccount = React.useMemo(
    () =>
      new Map(
        accounts.map((account) => [
          account.id,
          (mailboxesByAccount[account.id] ?? []).filter(isCustomMailbox),
        ])
      ),
    [accounts, mailboxesByAccount]
  )
  const {
    draggingProfileAccountKey,
    draggingRootKey: draggingSidebarItemKey,
    dropIndicator: sidebarDropIndicator,
    handleProfileDragOver: handleProfileAccountDragOver,
    handleProfileDrop: handleProfileAccountDrop,
    handleRootDragOver: handleSidebarItemDragOver,
    handleRootDrop: handleSidebarItemDrop,
    setDraggingProfileAccountKey,
    setDraggingRootKey: setDraggingSidebarItemKey,
    setDropIndicator: setSidebarDropIndicator,
  } = useSidebarDnd({
    orderedRootItems: orderedRootSidebarItems,
    saveProfileAccountOrder,
    saveSidebarOrder,
  })

  function getProfileAccounts(profile: MailProfileDto) {
    return profile.accountIds
      .map((accountId) => accountById.get(accountId))
      .filter((account): account is MailAccountDto => Boolean(account))
  }

  function renderCustomMailboxButton(
    account: MailAccountDto,
    mailbox: MailboxDto,
    key: string
  ) {
    const active =
      selectedAccountId === account.id &&
      selectedProfileId === null &&
      selectedMailboxPath === mailbox.path &&
      !selectedSpecialUse &&
      !customFoldersOnly &&
      !flaggedOnly

    return (
      <button
        className={`flex min-h-9 w-full items-center gap-2 px-2 py-1 text-left text-sm transition ${
          active
            ? "bg-mail-accent text-mail-accent-foreground"
            : "text-[#4c5661] hover:bg-[#edf0f3] dark:text-[#c4ccd4] dark:hover:bg-[#23282d]"
        }`}
        key={key}
        type="button"
        onClick={() => selectAccountMailbox(account.id, mailbox.path)}
      >
        <MailboxIcon specialUse={mailbox.specialUse} />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{formatMailboxName(mailbox)}</span>
          <span className="block truncate text-[11px] opacity-65">
            {getMailAccountLabel(account)}
          </span>
        </span>
      </button>
    )
  }

  function getOrderedSectionItems(section: MailSection) {
    return sortSidebarOrderableItems(
      orderedRootSidebarItems.filter((item) =>
        hasSectionSidebarItem(item, section)
      ),
      sidebarOrder
    )
  }

  function hasSectionSidebarItem(
    item: SidebarOrderableItem,
    section: MailSection
  ) {
    if (item.type === "account") {
      return (
        Boolean(section.flagged) ||
        Boolean(
          section.specialUse
            ? findSpecialMailbox(
                mailboxesByAccount[item.account.id] ?? [],
                section.specialUse
              )
            : null
        )
      )
    }

    const profileAccounts = getProfileAccounts(item.profile)

    return (
      profileAccounts.length > 0 &&
      (Boolean(section.flagged) ||
        profileAccounts.some((account) =>
          section.specialUse
            ? Boolean(
                findSpecialMailbox(
                  mailboxesByAccount[account.id] ?? [],
                  section.specialUse
                )
              )
            : true
        ))
    )
  }

  function renderSectionItem(item: SidebarOrderableItem, section: MailSection) {
    return item.type === "profile"
      ? renderSectionProfile(item.profile, section, item)
      : renderSectionAccount(item.account, section, item)
  }

  function renderSectionProfile(
    profile: MailProfileDto,
    section: MailSection,
    item: SidebarOrderableItem
  ) {
    const profileAccounts = getProfileAccounts(profile)
    const active =
      selectedProfileId === profile.id &&
      selectedAccountId === null &&
      (section.flagged
        ? flaggedOnly
        : selectedSpecialUse === section.specialUse &&
          !customFoldersOnly &&
          !flaggedOnly)
    const unreadCount = sumSpecialMailboxUnreadCount(
      profileAccounts,
      mailboxesByAccount,
      section.specialUse
    )
    const profileSectionKey = getProfileSectionKey(section.id, profile.id)
    const profileExpanded = Boolean(expandedSections[profileSectionKey])
    const itemKey = getSidebarOrderableItemKey(item)
    const dropPosition = getRootDropPosition(sidebarDropIndicator, itemKey)

    return (
      <div
        draggable
        data-drop-group="true"
        key={`${section.id}-profile-${profile.id}`}
        className={cn(
          "relative",
          draggingSidebarItemKey === itemKey && "opacity-50"
        )}
        onDragEnd={() => {
          setDraggingSidebarItemKey(null)
          setSidebarDropIndicator(null)
        }}
        onDragOver={(event) => handleSidebarItemDragOver(event, item)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move"
          event.dataTransfer.setData("text/plain", itemKey)
          setDraggingSidebarItemKey(itemKey)
        }}
        onDrop={(event) => handleSidebarItemDrop(event, item)}
      >
        {renderDropIndicator(dropPosition)}
        <div
          data-drop-row="true"
          className={`flex h-9 w-full cursor-grab items-center text-sm transition active:cursor-grabbing ${
            active
              ? "bg-mail-accent text-mail-accent-foreground"
              : "text-[#4c5661] hover:bg-[#edf0f3] dark:text-[#c4ccd4] dark:hover:bg-[#23282d]"
          }`}
        >
          <button
            aria-label={
              profileExpanded
                ? t("Свернуть профиль", "Collapse profile")
                : t("Раскрыть профиль", "Expand profile")
            }
            className="grid size-8 shrink-0 place-items-center"
            type="button"
            onClick={() => toggleSection(profileSectionKey)}
          >
            {profileExpanded ? (
              <IconChevronDown className="size-3.5 shrink-0 opacity-70" />
            ) : (
              <IconChevronRight className="size-3.5 shrink-0 opacity-70" />
            )}
          </button>
          <button
            className="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-2 text-left"
            type="button"
            onClick={() => {
              if (!profileExpanded) {
                toggleSection(profileSectionKey)
              }

              selectProfileSection(profile.id, section)
            }}
          >
            <span className="min-w-0 flex-1 truncate">{profile.name}</span>
            {section.id === "inbox" ? (
              <span className="shrink-0 text-xs font-semibold opacity-80">
                {compactNumber(unreadCount)}
              </span>
            ) : (
              <span className="shrink-0 text-xs opacity-55">
                {compactNumber(profileAccounts.length)}
              </span>
            )}
          </button>
        </div>

        {profileExpanded ? (
          <div className="mt-1 space-y-1 pl-6">
            {profileAccounts.map((account) =>
              renderProfileAccount(profile, account, section)
            )}
          </div>
        ) : null}
      </div>
    )
  }

  function renderProfileAccount(
    profile: MailProfileDto,
    account: MailAccountDto,
    section: MailSection
  ) {
    const accountMailboxes = mailboxesByAccount[account.id] ?? []
    const mailbox = section.specialUse
      ? findSpecialMailbox(accountMailboxes, section.specialUse)
      : null

    if (!section.flagged && !mailbox) {
      return null
    }

    const active =
      selectedAccountId === account.id &&
      selectedProfileId === null &&
      (section.flagged
        ? flaggedOnly
        : selectedMailboxPath === mailbox?.path &&
          !selectedSpecialUse &&
          !customFoldersOnly &&
          !flaggedOnly)
    const dragKey = getProfileAccountDragKey(profile.id, account.id)
    const dropPosition = getProfileAccountDropPosition(
      sidebarDropIndicator,
      profile.id,
      account.id
    )

    return (
      <button
        draggable
        className={`relative flex h-9 w-full cursor-grab items-center gap-2 px-2 text-left text-sm transition active:cursor-grabbing ${
          active
            ? "bg-mail-accent text-mail-accent-foreground"
            : "text-[#4c5661] hover:bg-[#edf0f3] dark:text-[#c4ccd4] dark:hover:bg-[#23282d]"
        } ${draggingProfileAccountKey === dragKey ? "opacity-50" : ""}`}
        key={`${section.id}-profile-${profile.id}-${account.id}`}
        type="button"
        onClick={() => {
          if (section.flagged) {
            selectFlaggedAccount(account.id)
            return
          }

          if (mailbox) {
            selectAccountMailbox(account.id, mailbox.path)
          }
        }}
        onDragEnd={(event) => {
          event.stopPropagation()
          setDraggingProfileAccountKey(null)
          setSidebarDropIndicator(null)
        }}
        onDragOver={(event) =>
          handleProfileAccountDragOver(event, profile, account.id)
        }
        onDragStart={(event) => {
          event.stopPropagation()
          event.dataTransfer.effectAllowed = "move"
          event.dataTransfer.setData("text/plain", dragKey)
          setDraggingProfileAccountKey(dragKey)
        }}
        onDrop={(event) => {
          if (!draggingProfileAccountKey) {
            return
          }

          event.stopPropagation()
          handleProfileAccountDrop(event, profile, account.id)
        }}
      >
        {renderDropIndicator(dropPosition)}
        <span className="min-w-0 flex-1 truncate">
          {getMailAccountLabel(account)}
        </span>
        {section.id === "inbox" && mailbox?.messagesUnread ? (
          <span className="shrink-0 text-xs font-semibold opacity-80">
            {compactNumber(mailbox.messagesUnread)}
          </span>
        ) : null}
      </button>
    )
  }

  function renderSectionAccount(
    account: MailAccountDto,
    section: MailSection,
    item: SidebarOrderableItem
  ) {
    const accountMailboxes = mailboxesByAccount[account.id] ?? []
    const mailbox = section.specialUse
      ? findSpecialMailbox(accountMailboxes, section.specialUse)
      : null

    if (!section.flagged && !mailbox) {
      return null
    }

    const active =
      selectedAccountId === account.id &&
      selectedProfileId === null &&
      (section.flagged
        ? flaggedOnly
        : selectedMailboxPath === mailbox?.path &&
          !selectedSpecialUse &&
          !customFoldersOnly &&
          !flaggedOnly)
    const itemKey = getSidebarOrderableItemKey(item)
    const dropPosition = getRootDropPosition(sidebarDropIndicator, itemKey)

    return (
      <button
        draggable
        className={`relative flex h-9 w-full cursor-grab items-center gap-2 px-2 text-left text-sm transition active:cursor-grabbing ${
          active
            ? "bg-mail-accent text-mail-accent-foreground"
            : "text-[#4c5661] hover:bg-[#edf0f3] dark:text-[#c4ccd4] dark:hover:bg-[#23282d]"
        } ${draggingSidebarItemKey === itemKey ? "opacity-50" : ""}`}
        key={`${section.id}-${account.id}`}
        type="button"
        onClick={() => {
          if (section.flagged) {
            selectFlaggedAccount(account.id)
            return
          }

          if (mailbox) {
            selectAccountMailbox(account.id, mailbox.path)
          }
        }}
        onDragEnd={() => {
          setDraggingSidebarItemKey(null)
          setSidebarDropIndicator(null)
        }}
        onDragOver={(event) => handleSidebarItemDragOver(event, item)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move"
          event.dataTransfer.setData("text/plain", itemKey)
          setDraggingSidebarItemKey(itemKey)
        }}
        onDrop={(event) => handleSidebarItemDrop(event, item)}
      >
        {renderDropIndicator(dropPosition)}
        <span className="min-w-0 flex-1 truncate">
          {getMailAccountLabel(account)}
        </span>
        {section.id === "inbox" && mailbox?.messagesUnread ? (
          <span className="shrink-0 text-xs font-semibold opacity-80">
            {compactNumber(mailbox.messagesUnread)}
          </span>
        ) : null}
      </button>
    )
  }

  function getOrderedCustomFolderItems() {
    return sortSidebarOrderableItems(
      orderedRootSidebarItems.filter((item) => {
        if (item.type === "account") {
          return (
            (customMailboxesByAccount.get(item.account.id) ?? []).length > 0
          )
        }

        return getProfileAccounts(item.profile).some(
          (account) =>
            (customMailboxesByAccount.get(account.id) ?? []).length > 0
        )
      }),
      sidebarOrder
    )
  }

  function renderCustomFolderItem(item: SidebarOrderableItem) {
    return item.type === "profile"
      ? renderCustomFolderProfile(item.profile, item)
      : renderCustomFolderAccount(item.account, item)
  }

  function renderCustomFolderProfile(
    profile: MailProfileDto,
    item: SidebarOrderableItem
  ) {
    const profileAccounts = getProfileAccounts(profile)
    const customFolderCount = profileAccounts.reduce(
      (total, account) =>
        total + (customMailboxesByAccount.get(account.id)?.length ?? 0),
      0
    )

    if (customFolderCount === 0) {
      return null
    }

    const profileSectionKey = getProfileSectionKey("folders", profile.id)
    const profileExpanded = Boolean(expandedSections[profileSectionKey])
    const active =
      selectedProfileId === null &&
      !customFoldersOnly &&
      !selectedSpecialUse &&
      !flaggedOnly &&
      profileAccounts.some(
        (account) =>
          selectedAccountId === account.id &&
          (customMailboxesByAccount.get(account.id) ?? []).some(
            (mailbox) => mailbox.path === selectedMailboxPath
          )
      )
    const itemKey = getSidebarOrderableItemKey(item)
    const dropPosition = getRootDropPosition(sidebarDropIndicator, itemKey)

    return (
      <div
        draggable
        data-drop-group="true"
        key={`folders-profile-${profile.id}`}
        className={cn(
          "relative",
          draggingSidebarItemKey === itemKey && "opacity-50"
        )}
        onDragEnd={() => {
          setDraggingSidebarItemKey(null)
          setSidebarDropIndicator(null)
        }}
        onDragOver={(event) => handleSidebarItemDragOver(event, item)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move"
          event.dataTransfer.setData("text/plain", itemKey)
          setDraggingSidebarItemKey(itemKey)
        }}
        onDrop={(event) => handleSidebarItemDrop(event, item)}
      >
        {renderDropIndicator(dropPosition)}
        <div
          data-drop-row="true"
          className={`flex h-9 w-full cursor-grab items-center text-sm transition active:cursor-grabbing ${
            active
              ? "bg-mail-accent text-mail-accent-foreground"
              : "text-[#4c5661] hover:bg-[#edf0f3] dark:text-[#c4ccd4] dark:hover:bg-[#23282d]"
          }`}
        >
          <button
            aria-label={
              profileExpanded
                ? t("Свернуть профиль", "Collapse profile")
                : t("Раскрыть профиль", "Expand profile")
            }
            className="grid size-8 shrink-0 place-items-center"
            type="button"
            onClick={() => toggleSection(profileSectionKey)}
          >
            {profileExpanded ? (
              <IconChevronDown className="size-3.5 shrink-0 opacity-70" />
            ) : (
              <IconChevronRight className="size-3.5 shrink-0 opacity-70" />
            )}
          </button>
          <button
            className="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-2 text-left"
            type="button"
            onClick={() => toggleSection(profileSectionKey)}
          >
            <span className="min-w-0 flex-1 truncate">{profile.name}</span>
            <span className="shrink-0 text-xs opacity-55">
              {compactNumber(customFolderCount)}
            </span>
          </button>
        </div>

        {profileExpanded ? (
          <div className="mt-1 space-y-1 pl-6">
            {profileAccounts.flatMap((account) =>
              (customMailboxesByAccount.get(account.id) ?? []).map((mailbox) =>
                renderCustomMailboxButton(
                  account,
                  mailbox,
                  `folders-profile-${profile.id}-${account.id}-${mailbox.path}`
                )
              )
            )}
          </div>
        ) : null}
      </div>
    )
  }

  function renderCustomFolderAccount(
    account: MailAccountDto,
    item: SidebarOrderableItem
  ) {
    const customMailboxes = customMailboxesByAccount.get(account.id) ?? []

    if (customMailboxes.length === 0) {
      return null
    }

    const accountSectionKey = getAccountFoldersSectionKey(account.id)
    const accountExpanded = Boolean(expandedSections[accountSectionKey])
    const active =
      selectedAccountId === account.id &&
      selectedProfileId === null &&
      !customFoldersOnly &&
      !selectedSpecialUse &&
      !flaggedOnly &&
      customMailboxes.some((mailbox) => mailbox.path === selectedMailboxPath)
    const itemKey = getSidebarOrderableItemKey(item)
    const dropPosition = getRootDropPosition(sidebarDropIndicator, itemKey)

    return (
      <div
        draggable
        data-drop-group="true"
        key={`folders-account-${account.id}`}
        className={cn(
          "relative",
          draggingSidebarItemKey === itemKey && "opacity-50"
        )}
        onDragEnd={() => {
          setDraggingSidebarItemKey(null)
          setSidebarDropIndicator(null)
        }}
        onDragOver={(event) => handleSidebarItemDragOver(event, item)}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move"
          event.dataTransfer.setData("text/plain", itemKey)
          setDraggingSidebarItemKey(itemKey)
        }}
        onDrop={(event) => handleSidebarItemDrop(event, item)}
      >
        {renderDropIndicator(dropPosition)}
        <div
          data-drop-row="true"
          className={`flex h-9 w-full cursor-grab items-center text-sm transition active:cursor-grabbing ${
            active
              ? "bg-mail-accent text-mail-accent-foreground"
              : "text-[#4c5661] hover:bg-[#edf0f3] dark:text-[#c4ccd4] dark:hover:bg-[#23282d]"
          }`}
        >
          <button
            aria-label={
              accountExpanded
                ? t("Свернуть почту", "Collapse mailbox")
                : t("Раскрыть почту", "Expand mailbox")
            }
            className="grid size-8 shrink-0 place-items-center"
            type="button"
            onClick={() => toggleSection(accountSectionKey)}
          >
            {accountExpanded ? (
              <IconChevronDown className="size-3.5 shrink-0 opacity-70" />
            ) : (
              <IconChevronRight className="size-3.5 shrink-0 opacity-70" />
            )}
          </button>
          <button
            className="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-2 text-left"
            type="button"
            onClick={() => toggleSection(accountSectionKey)}
          >
            <span className="min-w-0 flex-1 truncate">
              {getMailAccountLabel(account)}
            </span>
            <span className="shrink-0 text-xs opacity-55">
              {compactNumber(customMailboxes.length)}
            </span>
          </button>
        </div>

        {accountExpanded ? (
          <div className="mt-1 space-y-1 pl-6">
            {customMailboxes.map((mailbox) =>
              renderCustomMailboxButton(
                account,
                mailbox,
                `${account.id}-${mailbox.path}`
              )
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <MailSidebarFrame mobileOpen={mobileSidebarOpen}>
      <MailSidebarHeader
        actions={
          <>
            <ThemeToggle />
            <Button
              aria-label={t("Настройки", "Settings")}
              aria-pressed={settingsOpen}
              size="icon-sm"
              variant="ghost"
              onFocus={preloadSettingsPanel}
              onPointerEnter={preloadSettingsPanel}
              onClick={() => {
                onOpenSettings()
              }}
            >
              <IconSettings className="size-4" />
            </Button>
            <Button
              aria-label={t("Закрыть меню", "Close menu")}
              className="lg:hidden"
              size="icon-sm"
              variant="ghost"
              onClick={closeMobileSidebar}
            >
              <IconX className="size-4" />
            </Button>
          </>
        }
      />

      <div className="custom-scrollbar min-h-0 flex-1 overflow-auto px-3 py-4">
        <MailSidebarSectionLabel
          action={
            <Button
              aria-label={t(
                "Обновить аккаунты и папки",
                "Refresh accounts and folders"
              )}
              size="icon-xs"
              variant="ghost"
              onClick={() => {
                invalidateMailCaches()
                void loadAccounts({ force: true })
                void loadProfiles({ force: true })
              }}
            >
              {accountsLoading || profilesLoading ? (
                <IconLoader2 className="size-3 animate-spin" />
              ) : (
                <IconRefresh className="size-3" />
              )}
            </Button>
          }
        >
          {t("Почта", "Mail")}
        </MailSidebarSectionLabel>

        <div className="space-y-1">
          {mailSections.map((section) => {
            const Icon = section.icon
            const expanded = Boolean(expandedSections[section.id])
            const active =
              selectedAccountId === null &&
              selectedProfileId === null &&
              !customFoldersOnly &&
              (section.flagged
                ? flaggedOnly
                : selectedSpecialUse === section.specialUse && !flaggedOnly)

            return (
              <div key={section.id}>
                <div
                  className={`flex h-9 w-full items-center text-sm transition ${
                    active
                      ? "bg-mail-accent text-mail-accent-foreground"
                      : "text-[#30363d] hover:bg-[#edf0f3] dark:text-[#d7dde3] dark:hover:bg-[#23282d]"
                  }`}
                >
                  <button
                    aria-label={
                      expanded
                        ? t("Свернуть раздел", "Collapse section")
                        : t("Раскрыть раздел", "Expand section")
                    }
                    className="grid size-8 shrink-0 place-items-center"
                    type="button"
                    onClick={() => toggleSection(section.id)}
                  >
                    {expanded ? (
                      <IconChevronDown className="size-3.5 shrink-0 opacity-70" />
                    ) : (
                      <IconChevronRight className="size-3.5 shrink-0 opacity-70" />
                    )}
                  </button>
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-2 text-left"
                    type="button"
                    onClick={() => selectSection(section)}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {section.title}
                    </span>
                    {section.id === "inbox" ? (
                      <span className="shrink-0 text-xs opacity-60">
                        {compactNumber(
                          sumSpecialMailboxUnreadCount(
                            accounts,
                            mailboxesByAccount,
                            section.specialUse
                          )
                        )}
                      </span>
                    ) : null}
                  </button>
                </div>

                {expanded ? (
                  <div className="mt-1 space-y-1 pl-6">
                    {getOrderedSectionItems(section).map((item) =>
                      renderSectionItem(item, section)
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}

          <div className="pt-3">
            <div
              className={`mb-1 flex h-9 w-full items-center text-sm transition ${
                customFoldersOnly &&
                selectedAccountId === null &&
                selectedProfileId === null
                  ? "bg-mail-accent text-mail-accent-foreground"
                  : "text-[#7a838c] hover:bg-[#edf0f3] dark:text-[#9ca6af] dark:hover:bg-[#23282d]"
              }`}
            >
              <button
                aria-label={
                  expandedSections.folders
                    ? t("Свернуть папки", "Collapse folders")
                    : t("Раскрыть папки", "Expand folders")
                }
                className="grid size-8 shrink-0 place-items-center"
                type="button"
                onClick={() => toggleSection("folders")}
              >
                {expandedSections.folders ? (
                  <IconChevronDown className="size-3.5 shrink-0" />
                ) : (
                  <IconChevronRight className="size-3.5 shrink-0" />
                )}
              </button>
              <button
                className="flex min-w-0 flex-1 items-center gap-2 self-stretch pr-2 text-left"
                type="button"
                onClick={selectCustomFolders}
              >
                <IconFolder className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {t("Папки", "Folders")}
                </span>
                {mailboxesLoading ? (
                  <IconLoader2 className="size-3 animate-spin" />
                ) : null}
              </button>
            </div>

            {expandedSections.folders ? (
              <div className="space-y-1 pl-6">
                {getOrderedCustomFolderItems().map(renderCustomFolderItem)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </MailSidebarFrame>
  )
})

function getProfileSectionKey(sectionId: string, profileId: string) {
  return `profile:${sectionId}:${profileId}`
}

function getAccountFoldersSectionKey(accountId: string) {
  return `account-folders:${accountId}`
}

function isCustomMailbox(mailbox: MailboxDto) {
  return !mailbox.specialUse || !standardSpecialUses.has(mailbox.specialUse)
}
