import { mailText } from "@workspace/mail-design/locale"
import { useMailLocale } from "@workspace/mail-design"
import * as React from "react"
import IconFolder from "@tabler/icons-react/dist/esm/icons/IconFolder.mjs"
import IconSelector from "@tabler/icons-react/dist/esm/icons/IconSelector.mjs"
import { MailboxIcon } from "@workspace/mail-design"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

import {
  mailSections,
  standardSpecialUses,
  type MailSection,
} from "@/features/mail/model/mail-sections"
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
} from "@/lib/api-client"

export function MailFolderSwitcher({
  accounts,
  customFoldersOnly,
  flaggedOnly,
  mailboxesByAccount,
  profiles,
  selectedAccountId,
  selectedMailboxPath,
  selectedProfileId,
  selectedSpecialUse,
  onSelectAccountMailbox,
  onSelectCustomFolders,
  onSelectProfileSection,
  onSelectSection,
}: {
  accounts: MailAccountDto[]
  customFoldersOnly: boolean
  flaggedOnly: boolean
  mailboxesByAccount: Record<string, MailboxDto[]>
  profiles: MailProfileDto[]
  selectedAccountId: string | null
  selectedMailboxPath: string | null
  selectedProfileId: string | null
  selectedSpecialUse: string | null
  onSelectAccountMailbox: (accountId: string, mailboxPath: string) => void
  onSelectCustomFolders: () => void
  onSelectProfileSection: (profileId: string, section: MailSection) => void
  onSelectSection: (section: MailSection) => void
}) {
  const { t } = useMailLocale()

  const accountById = React.useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  )
  const profiledAccountIds = React.useMemo(
    () => new Set(profiles.flatMap((profile) => profile.accountIds)),
    [profiles]
  )
  const unprofiledAccounts = React.useMemo(
    () => accounts.filter((account) => !profiledAccountIds.has(account.id)),
    [accounts, profiledAccountIds]
  )
  const activeSelection = getMailFolderSelection({
    accountById,
    customFoldersOnly,
    flaggedOnly,
    mailboxesByAccount,
    profiles,
    selectedAccountId,
    selectedMailboxPath,
    selectedProfileId,
    selectedSpecialUse,
  })

  function getProfileAccounts(profile: MailProfileDto) {
    return profile.accountIds
      .map((accountId) => accountById.get(accountId))
      .filter((account): account is MailAccountDto => Boolean(account))
  }

  function getCustomMailboxes(account: MailAccountDto) {
    return (mailboxesByAccount[account.id] ?? []).filter(isCustomMailbox)
  }

  function getSpecialMailbox(account: MailAccountDto, section: MailSection) {
    return section.specialUse
      ? findSpecialMailbox(
          mailboxesByAccount[account.id] ?? [],
          section.specialUse
        )
      : null
  }

  function isRootSectionActive(section: MailSection) {
    return (
      selectedAccountId === null &&
      selectedProfileId === null &&
      !customFoldersOnly &&
      (section.flagged
        ? flaggedOnly
        : selectedSpecialUse === section.specialUse && !flaggedOnly)
    )
  }

  function isProfileSectionActive(profileId: string, section: MailSection) {
    return (
      selectedProfileId === profileId &&
      selectedAccountId === null &&
      !customFoldersOnly &&
      (section.flagged
        ? flaggedOnly
        : selectedSpecialUse === section.specialUse && !flaggedOnly)
    )
  }

  function isAccountMailboxActive(accountId: string, mailboxPath: string) {
    return (
      selectedAccountId === accountId &&
      selectedProfileId === null &&
      selectedMailboxPath === mailboxPath &&
      !selectedSpecialUse &&
      !customFoldersOnly &&
      !flaggedOnly
    )
  }

  function renderSectionContent(section: MailSection) {
    const Icon = section.icon
    const unprofiledSectionItems = section.specialUse
      ? unprofiledAccounts.flatMap((account) => {
          const mailbox = getSpecialMailbox(account, section)

          return mailbox ? [{ account, mailbox }] : []
        })
      : []

    return (
      <>
        <DropdownMenuLabel>{section.title}</DropdownMenuLabel>
        <DropdownMenuItem
          data-active={isRootSectionActive(section) ? "true" : undefined}
          className={mailFolderMenuItemClassName}
          onSelect={() => onSelectSection(section)}
        >
          <span className={mailFolderMenuIconClassName}>
            <Icon className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {formatAllSectionTitle(section)}
          </span>
          <MailFolderMenuCount
            count={
              section.specialUse
                ? sumSpecialMailboxUnreadCount(
                    accounts,
                    mailboxesByAccount,
                    section.specialUse
                  )
                : 0
            }
          />
        </DropdownMenuItem>

        {profiles.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuGroup>
          {profiles.map((profile) => {
            const profileAccounts = getProfileAccounts(profile)
            const unreadCount = section.specialUse
              ? sumSpecialMailboxUnreadCount(
                  profileAccounts,
                  mailboxesByAccount,
                  section.specialUse
                )
              : 0

            return (
              <React.Fragment key={profile.id}>
                <DropdownMenuItem
                  data-active={
                    isProfileSectionActive(profile.id, section)
                      ? "true"
                      : undefined
                  }
                  className={mailFolderMenuItemClassName}
                  onSelect={() => onSelectProfileSection(profile.id, section)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {profile.name}
                  </span>
                  <MailFolderMenuCount count={unreadCount} />
                </DropdownMenuItem>

                {section.specialUse
                  ? profileAccounts.map((account) => {
                      const mailbox = getSpecialMailbox(account, section)

                      if (!mailbox) {
                        return null
                      }

                      return (
                        <DropdownMenuItem
                          data-active={
                            isAccountMailboxActive(account.id, mailbox.path)
                              ? "true"
                              : undefined
                          }
                          key={`${profile.id}:${account.id}:${section.id}`}
                          className={cn(mailFolderMenuItemClassName, "pl-8")}
                          onSelect={() =>
                            onSelectAccountMailbox(account.id, mailbox.path)
                          }
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {getMailAccountLabel(account)}
                          </span>
                          <MailFolderMenuCount
                            count={mailbox.messagesUnread ?? 0}
                          />
                        </DropdownMenuItem>
                      )
                    })
                  : null}
              </React.Fragment>
            )
          })}
        </DropdownMenuGroup>

        {unprofiledSectionItems.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {unprofiledSectionItems.map(({ account, mailbox }) => {
                return (
                  <DropdownMenuItem
                    data-active={
                      isAccountMailboxActive(account.id, mailbox.path)
                        ? "true"
                        : undefined
                    }
                    key={`${account.id}:${section.id}`}
                    className={mailFolderMenuItemClassName}
                    onSelect={() =>
                      onSelectAccountMailbox(account.id, mailbox.path)
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {getMailAccountLabel(account)}
                    </span>
                    <MailFolderMenuCount count={mailbox.messagesUnread ?? 0} />
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </>
        ) : null}
      </>
    )
  }

  function renderCustomFolderContent() {
    const hasCustomMailboxes = accounts.some(
      (account) => getCustomMailboxes(account).length > 0
    )

    return (
      <>
        <DropdownMenuLabel>{t("Папки", "Folders")}</DropdownMenuLabel>
        <DropdownMenuItem
          data-active={
            customFoldersOnly &&
            selectedAccountId === null &&
            selectedProfileId === null
              ? "true"
              : undefined
          }
          className={mailFolderMenuItemClassName}
          onSelect={onSelectCustomFolders}
        >
          <span className={mailFolderMenuIconClassName}>
            <IconFolder className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate">
            {t("Все папки", "All folders")}
          </span>
        </DropdownMenuItem>

        {hasCustomMailboxes ? (
          <>
            {profiles.map((profile) => {
              const profileAccounts = getProfileAccounts(profile)
              const customCount = profileAccounts.reduce(
                (total, account) => total + getCustomMailboxes(account).length,
                0
              )

              if (customCount === 0) {
                return null
              }

              return (
                <div key={`${profile.id}:custom-folders`} className="py-1">
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">
                      {profile.name}
                    </span>
                    <span>{compactNumber(customCount)}</span>
                  </div>
                  {profileAccounts.flatMap((account) =>
                    getCustomMailboxes(account).map((mailbox) => (
                      <DropdownMenuItem
                        data-active={
                          isAccountMailboxActive(account.id, mailbox.path)
                            ? "true"
                            : undefined
                        }
                        key={`${profile.id}:${account.id}:${mailbox.path}`}
                        className={cn(mailFolderMenuItemClassName, "pl-8")}
                        onSelect={() =>
                          onSelectAccountMailbox(account.id, mailbox.path)
                        }
                      >
                        <span className={mailFolderMenuIconClassName}>
                          <MailboxIcon specialUse={mailbox.specialUse} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            {formatMailboxName(mailbox)}
                          </span>
                          <span className="block truncate text-[11px] opacity-65">
                            {getMailAccountLabel(account)}
                          </span>
                        </span>
                        <MailFolderMenuCount
                          count={mailbox.messagesUnread ?? 0}
                        />
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              )
            })}

            {unprofiledAccounts.map((account) => {
              const customMailboxes = getCustomMailboxes(account)

              if (customMailboxes.length === 0) {
                return null
              }

              return (
                <div key={`${account.id}:custom-folders`} className="py-1">
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    <span className="min-w-0 flex-1 truncate">
                      {getMailAccountLabel(account)}
                    </span>
                    <span>{compactNumber(customMailboxes.length)}</span>
                  </div>
                  {customMailboxes.map((mailbox) => (
                    <DropdownMenuItem
                      data-active={
                        isAccountMailboxActive(account.id, mailbox.path)
                          ? "true"
                          : undefined
                      }
                      key={`${account.id}:${mailbox.path}`}
                      className={cn(mailFolderMenuItemClassName, "pl-8")}
                      onSelect={() =>
                        onSelectAccountMailbox(account.id, mailbox.path)
                      }
                    >
                      <span className={mailFolderMenuIconClassName}>
                        <MailboxIcon specialUse={mailbox.specialUse} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {formatMailboxName(mailbox)}
                      </span>
                      <MailFolderMenuCount
                        count={mailbox.messagesUnread ?? 0}
                      />
                    </DropdownMenuItem>
                  ))}
                </div>
              )
            })}
          </>
        ) : (
          <div className="px-3 py-3 text-sm text-muted-foreground">
            {t("Пользовательских папок нет", "No custom folders")}
          </div>
        )}
      </>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={t("Выбрать папку", "Select folder")}
          className="group flex h-10 min-w-0 flex-1 items-center gap-1.5 text-left transition focus-visible:ring-2 focus-visible:ring-[#1f8a70]/30 focus-visible:outline-none"
          type="button"
        >
          <span className="min-w-0 truncate text-lg leading-6 font-semibold text-[#20252a] group-hover:text-[#111315] sm:text-xl dark:text-[#eef2f4] dark:group-hover:text-white">
            {activeSelection.title}
          </span>
          <IconSelector className="size-5 shrink-0 text-[#4f5b66] transition group-data-[state=open]:text-[#20252a] dark:text-[#a7b0ba] dark:group-data-[state=open]:text-[#eef2f4]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        collisionPadding={8}
        sideOffset={8}
        className="w-[min(calc(100vw-2rem),23rem)] rounded-none border-[#d8dee5] bg-[#fbfcfd] p-1 shadow-[0_18px_48px_rgba(15,23,42,0.18)] sm:min-w-80 dark:border-[#30353a] dark:bg-[#171a1d]"
      >
        {activeSelection.custom
          ? renderCustomFolderContent()
          : renderSectionContent(activeSelection.section)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const mailFolderMenuItemClassName =
  "flex min-h-9 cursor-pointer items-center gap-2 rounded-none px-2 py-1 text-sm text-[#4c5661] transition focus:bg-[#edf0f3] focus:text-[#20252a] data-[active=true]:bg-[#151719] data-[active=true]:text-white dark:text-[#c4ccd4] dark:focus:bg-[#23282d] dark:focus:text-[#eef2f4] dark:data-[active=true]:bg-[#f6f3ef] dark:data-[active=true]:text-[#111315]"

const mailFolderMenuIconClassName =
  "grid size-4 shrink-0 place-items-center text-current"

function MailFolderMenuCount({ count }: { count: number }) {
  useMailLocale()

  if (count <= 0) {
    return null
  }

  return (
    <DropdownMenuShortcut className="tracking-normal">
      {compactNumber(count)}
    </DropdownMenuShortcut>
  )
}

function getMailFolderSelection({
  accountById,
  customFoldersOnly,
  flaggedOnly,
  mailboxesByAccount,
  profiles,
  selectedAccountId,
  selectedMailboxPath,
  selectedProfileId,
  selectedSpecialUse,
}: {
  accountById: Map<string, MailAccountDto>
  customFoldersOnly: boolean
  flaggedOnly: boolean
  mailboxesByAccount: Record<string, MailboxDto[]>
  profiles: MailProfileDto[]
  selectedAccountId: string | null
  selectedMailboxPath: string | null
  selectedProfileId: string | null
  selectedSpecialUse: string | null
}) {
  if (customFoldersOnly) {
    return {
      custom: true,
      section: mailSections[0],
      subtitle: mailText("Пользовательские папки", "Custom folders"),
      title: mailText("Папки", "Folders"),
    }
  }

  if (selectedProfileId) {
    const profile = profiles.find((item) => item.id === selectedProfileId)
    const section = getSelectedMailSection(selectedSpecialUse, flaggedOnly)

    return {
      custom: false,
      section,
      subtitle: profile?.name ?? mailText("Профиль", "Profile"),
      title: section.title,
    }
  }

  if (selectedAccountId) {
    const account = accountById.get(selectedAccountId)

    if (flaggedOnly) {
      const section = getSelectedMailSection(null, true)

      return {
        custom: false,
        section,
        subtitle: account?.address ?? mailText("Аккаунт", "Account"),
        title: section.title,
      }
    }

    const mailbox = selectedMailboxPath
      ? (mailboxesByAccount[selectedAccountId] ?? []).find(
          (item) => item.path === selectedMailboxPath
        )
      : null

    if (mailbox) {
      const section = getMailboxSection(mailbox)

      if (section) {
        return {
          custom: false,
          section,
          subtitle: account?.address ?? mailText("Аккаунт", "Account"),
          title: section.title,
        }
      }

      return {
        custom: true,
        section: mailSections[0],
        subtitle: account?.address ?? mailText("Аккаунт", "Account"),
        title: formatMailboxName(mailbox),
      }
    }

    const section = getSelectedMailSection(selectedSpecialUse, flaggedOnly)

    return {
      custom: false,
      section,
      subtitle: mailText("Аккаунт", "Account"),
      title: section.title,
    }
  }

  const section = getSelectedMailSection(selectedSpecialUse, flaggedOnly)

  return {
    custom: false,
    section,
    subtitle: mailText("Все аккаунты", "All accounts"),
    title: section.title,
  }
}

function getMailboxSection(mailbox: MailboxDto) {
  if (mailbox.path.toLowerCase() === "inbox") return mailSections[0]
  if (!mailbox.specialUse) {
    return null
  }

  return (
    mailSections.find((section) => section.specialUse === mailbox.specialUse) ??
    null
  )
}

function formatAllSectionTitle(section: MailSection) {
  const titles: Record<MailSection["id"], string> = {
    inbox: mailText("Все входящие", "All inbox messages"),
    pinned: mailText("Все закрепленные", "All pinned"),
    sent: mailText("Все отправленные", "All sent messages"),
    drafts: mailText("Все черновики", "All drafts"),
    junk: mailText("Весь спам", "All spam"),
    trash: mailText("Все удаленные", "All trash messages"),
  }
  return titles[section.id]
}

function getSelectedMailSection(
  selectedSpecialUse: string | null,
  flaggedOnly: boolean
) {
  if (flaggedOnly) {
    return mailSections.find((section) => section.flagged) ?? mailSections[0]
  }

  return (
    mailSections.find(
      (section) => !section.flagged && section.specialUse === selectedSpecialUse
    ) ?? mailSections[0]
  )
}

function isCustomMailbox(mailbox: MailboxDto) {
  return !mailbox.specialUse || !standardSpecialUses.has(mailbox.specialUse)
}
