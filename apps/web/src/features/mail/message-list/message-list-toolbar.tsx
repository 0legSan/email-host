import { useMailLocale } from "@workspace/mail-design"
import type { RefObject } from "react"
import { SearchChipsInput } from "@workspace/editor-ui"
import IconCheck from "@tabler/icons-react/dist/esm/icons/IconCheck.mjs"
import IconEdit from "@tabler/icons-react/dist/esm/icons/IconEdit.mjs"
import IconEye from "@tabler/icons-react/dist/esm/icons/IconEye.mjs"
import IconFolderX from "@tabler/icons-react/dist/esm/icons/IconFolderX.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconMenu2 from "@tabler/icons-react/dist/esm/icons/IconMenu2.mjs"
import IconPinned from "@tabler/icons-react/dist/esm/icons/IconPinned.mjs"
import IconRefresh from "@tabler/icons-react/dist/esm/icons/IconRefresh.mjs"
import IconSearch from "@tabler/icons-react/dist/esm/icons/IconSearch.mjs"
import IconTrash from "@tabler/icons-react/dist/esm/icons/IconTrash.mjs"
import { Button } from "@workspace/ui/components/button"
import { Tooltip } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { MailFolderSwitcher } from "./mail-folder-switcher"
import type { MailSection } from "@/features/mail/model/mail-sections"
import { compactNumber } from "@/features/mail/utils/mail-format"
import type {
  MailAccountDto,
  MailboxDto,
  MailProfileDto,
} from "@/lib/api-client"
import { getMailSearchFilters, type MailSearchValue } from "@/lib/mail-search"

type MessageListToolbarProps = {
  accounts: MailAccountDto[]
  allMessagesSelected: boolean
  allSelectedFlagged: boolean
  customFoldersOnly: boolean
  flaggedOnly: boolean
  mailboxesByAccount: Record<string, MailboxDto[]>
  messagesCount: number
  offlineStatusActive: boolean
  profiles: MailProfileDto[]
  searchActive: boolean
  searchActiveFromRoute: boolean
  searchIndexIncomplete: boolean
  searchInputRef: RefObject<HTMLInputElement | null>
  searchScopeLabel: string
  searchValue: MailSearchValue
  selectedAccountId: string | null
  selectedMailboxPath: string | null
  selectedMessageCount: number
  selectedProfileId: string | null
  selectedSpecialUse: string | null
  selectedUnreadCount: number
  syncLoading: boolean
  unreadMessageCount: number
  unreadOnly: boolean
  preloadComposePanel: () => void
  onActivateSearch: () => void
  onCloseSearch: () => void
  onMoveCheckedMessagesToSpecial: (specialUse: string) => void | Promise<void>
  onOpenComposer: () => void
  onOpenMobileSidebar: () => void
  onSearchValueChange: (value: MailSearchValue) => void
  onSelectAccountMailbox: (accountId: string, mailboxPath: string) => void
  onSelectCustomFolders: () => void
  onSelectProfileSection: (profileId: string, section: MailSection) => void
  onSelectSection: (section: MailSection) => void
  onSyncLocal: () => void | Promise<void>
  onToggleAllMessagesSelection: () => void
  onToggleUnreadOnly: () => void
  onUpdateCheckedMessageFlags: (flags: {
    seen?: boolean
    flagged?: boolean
  }) => void | Promise<void>
}

export function MessageListToolbar({
  accounts,
  allMessagesSelected,
  allSelectedFlagged,
  customFoldersOnly,
  flaggedOnly,
  mailboxesByAccount,
  messagesCount,
  offlineStatusActive,
  profiles,
  searchActive,
  searchActiveFromRoute,
  searchIndexIncomplete,
  searchInputRef,
  searchScopeLabel,
  searchValue,
  selectedAccountId,
  selectedMailboxPath,
  selectedMessageCount,
  selectedProfileId,
  selectedSpecialUse,
  selectedUnreadCount,
  syncLoading,
  unreadMessageCount,
  unreadOnly,
  preloadComposePanel,
  onActivateSearch,
  onCloseSearch,
  onMoveCheckedMessagesToSpecial,
  onOpenComposer,
  onOpenMobileSidebar,
  onSearchValueChange,
  onSelectAccountMailbox,
  onSelectCustomFolders,
  onSelectProfileSection,
  onSelectSection,
  onSyncLocal,
  onToggleAllMessagesSelection,
  onToggleUnreadOnly,
  onUpdateCheckedMessageFlags,
}: MessageListToolbarProps) {
  const { t, locale } = useMailLocale()

  const selectButtonLabel =
    selectedMessageCount === messagesCount && messagesCount > 0
      ? t("Снять выделение", "Clear selection")
      : unreadMessageCount > 0 && selectedUnreadCount < unreadMessageCount
        ? t(
            `Выбрать непрочитанные (${compactNumber(unreadMessageCount)})`,
            `Select unread (${compactNumber(unreadMessageCount)})`
          )
        : t("Выбрать все загруженные", "Select all loaded")

  return (
    <div className="shrink-0 border-b border-[#d8dee5] bg-[#f8fafb]/95 px-4 py-3 dark:border-[#30353a] dark:bg-[#131619]/95">
      <div className="flex items-center gap-2">
        {searchActive ? (
          <div className="min-w-0 flex-1">
            <SearchChipsInput
              ref={searchInputRef}
              className="w-full"
              filters={getMailSearchFilters(locale)}
              labels={{
                clear: t("Очистить поиск", "Clear search"),
                close: t("Закрыть поиск", "Close search"),
                filters: t("Настройки поиска", "Search filters"),
                remove: t("Убрать фильтр", "Remove filter"),
              }}
              inputLabel={searchScopeLabel}
              leadingIcon={<IconSearch className="size-4" />}
              placeholder={t(
                "Тема, отправитель или текст письма",
                "Subject, sender or message text"
              )}
              value={searchValue}
              onChange={onSearchValueChange}
              onClose={onCloseSearch}
            />
            <div
              aria-live="polite"
              className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11px] leading-4"
            >
              <span className="truncate text-[#66727d] dark:text-[#9da7b1]">
                {searchScopeLabel}
              </span>
              {offlineStatusActive ? (
                <span className="text-[#9a5a16] dark:text-[#e4ab68]">
                  {t(
                    "Поиск только по сохранённым письмам",
                    "Search saved messages only"
                  )}
                </span>
              ) : searchIndexIncomplete ? (
                <span className="text-[#9a5a16] dark:text-[#e4ab68]">
                  {t(
                    "Индексируем старые письма — результаты пока могут быть неполными",
                    "Indexing older messages. Results may be incomplete"
                  )}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <Tooltip content={t("Меню", "Menu")}>
              <Button
                aria-label={t("Открыть меню", "Open menu")}
                className="size-10 shrink-0 text-[#20252a] hover:bg-[#edf2f5] lg:hidden dark:text-[#eef2f4] dark:hover:bg-[#23282d]"
                size="icon-sm"
                variant="ghost"
                onClick={onOpenMobileSidebar}
              >
                <IconMenu2 className="size-5" />
              </Button>
            </Tooltip>

            <MailFolderSwitcher
              accounts={accounts}
              customFoldersOnly={customFoldersOnly}
              flaggedOnly={flaggedOnly}
              mailboxesByAccount={mailboxesByAccount}
              profiles={profiles}
              selectedAccountId={selectedAccountId}
              selectedMailboxPath={selectedMailboxPath}
              selectedProfileId={selectedProfileId}
              selectedSpecialUse={selectedSpecialUse}
              onSelectAccountMailbox={onSelectAccountMailbox}
              onSelectCustomFolders={onSelectCustomFolders}
              onSelectProfileSection={onSelectProfileSection}
              onSelectSection={onSelectSection}
            />

            <Tooltip content={t("Поиск", "Search")}>
              <Button
                aria-label={t("Поиск по письмам", "Search messages")}
                aria-pressed={searchActiveFromRoute}
                className={cn(
                  "size-10 shrink-0 text-[#20252a] hover:bg-[#edf2f5] dark:text-[#eef2f4] dark:hover:bg-[#23282d]",
                  searchActiveFromRoute &&
                    "bg-[#e6f3ee] text-[#136b56] dark:bg-[#17342d] dark:text-[#7ee0c0]"
                )}
                size="icon-sm"
                variant="ghost"
                onClick={onActivateSearch}
              >
                <IconSearch className="size-5" />
              </Button>
            </Tooltip>

            <button
              aria-label={
                unreadOnly
                  ? t("Показать прочитанные письма", "Show read messages")
                  : t("Скрыть прочитанные письма", "Hide read messages")
              }
              aria-pressed={!unreadOnly}
              className="focus-visible:ring-mail-accent-text relative h-10 w-12 shrink-0 transition focus-visible:ring-2 focus-visible:outline-none"
              type="button"
              onClick={onToggleUnreadOnly}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-1/2 left-1.5 h-3 w-8 -translate-y-1/2 rounded-full transition-colors",
                  unreadOnly
                    ? "bg-[#aab3bd] dark:bg-[#505a64]"
                    : "border-mail-accent-text bg-mail-accent border"
                )}
              />
              <span
                className={cn(
                  "absolute top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border transition-transform",
                  unreadOnly
                    ? "translate-x-1.5 border-[#73808c] bg-[#56616d] text-white shadow-[0_2px_6px_rgba(20,28,36,0.24)] dark:border-[#4f5964] dark:bg-[#2d3540]"
                    : "translate-x-[22px] border-[#3b444d] bg-[#343b44] text-white shadow-[0_3px_8px_rgba(20,28,36,0.32)]"
                )}
              >
                <IconEye className="size-4" />
              </span>
            </button>

            <Tooltip content={t("Написать письмо", "Compose")}>
              <Button
                aria-label={t("Написать письмо", "Compose")}
                className="size-10 text-[#20252a] hover:bg-[#edf2f5] dark:text-[#eef2f4] dark:hover:bg-[#23282d]"
                size="icon-sm"
                variant="ghost"
                onFocus={preloadComposePanel}
                onPointerEnter={preloadComposePanel}
                onClick={onOpenComposer}
              >
                <IconEdit className="size-5" />
              </Button>
            </Tooltip>
          </>
        )}
      </div>

      <div className="@container mt-3 flex flex-nowrap items-center gap-3 border-t border-[#e2e7ec] pt-3 dark:border-[#252b31]">
        <Tooltip content={selectButtonLabel}>
          <button
            aria-pressed={allMessagesSelected}
            aria-label={selectButtonLabel}
            className="grid size-7 shrink-0 place-items-center text-[#4f5b66] hover:text-[#20252a] disabled:opacity-35 @min-[400px]:block @min-[400px]:size-auto @min-[400px]:text-[10px] @min-[400px]:leading-4 @min-[400px]:font-semibold @min-[400px]:tracking-[0.06em] @min-[400px]:uppercase dark:text-[#a7b0ba] dark:hover:text-[#eef2f4]"
            disabled={messagesCount === 0}
            type="button"
            onClick={onToggleAllMessagesSelection}
          >
            <IconCheck className="size-4 @min-[400px]:hidden" />
            <span className="hidden @min-[400px]:inline">
              {selectedMessageCount > 0
                ? t(
                    `${compactNumber(selectedMessageCount)} выбрано`,
                    `${compactNumber(selectedMessageCount)} selected`
                  )
                : t("Выбрать", "Select")}
            </span>
          </button>
        </Tooltip>
        <Tooltip content={t("Прочитать", "Mark as read")}>
          <button
            aria-label={t(
              "Отметить выбранные письма прочитанными",
              "Mark selected messages as read"
            )}
            className="grid size-7 shrink-0 place-items-center text-[#4f5b66] hover:text-[#20252a] disabled:opacity-35 @min-[400px]:block @min-[400px]:size-auto @min-[400px]:text-[10px] @min-[400px]:leading-4 @min-[400px]:font-semibold @min-[400px]:tracking-[0.06em] @min-[400px]:uppercase dark:text-[#a7b0ba] dark:hover:text-[#eef2f4]"
            disabled={selectedMessageCount === 0}
            type="button"
            onClick={() =>
              void onUpdateCheckedMessageFlags({
                seen: selectedUnreadCount > 0,
              })
            }
          >
            <IconEye className="size-4 @min-[400px]:hidden" />
            <span className="hidden @min-[400px]:inline">
              {t("Прочитать", "Mark as read")}
            </span>
          </button>
        </Tooltip>
        <Tooltip content={t("Закрепить", "Pin")}>
          <button
            aria-label={t(
              "Закрепить выбранные письма",
              "Pin selected messages"
            )}
            className="grid size-7 shrink-0 place-items-center text-[#4f5b66] hover:text-[#20252a] disabled:opacity-35 @min-[400px]:block @min-[400px]:size-auto @min-[400px]:text-[10px] @min-[400px]:leading-4 @min-[400px]:font-semibold @min-[400px]:tracking-[0.06em] @min-[400px]:uppercase dark:text-[#a7b0ba] dark:hover:text-[#eef2f4]"
            disabled={selectedMessageCount === 0}
            type="button"
            onClick={() =>
              void onUpdateCheckedMessageFlags({
                flagged: !allSelectedFlagged,
              })
            }
          >
            <IconPinned className="size-4 @min-[400px]:hidden" />
            <span className="hidden @min-[400px]:inline">
              {t("Закрепить", "Pin")}
            </span>
          </button>
        </Tooltip>
        <Tooltip content={t("Удалить", "Delete")}>
          <button
            aria-label={t(
              "Удалить выбранные письма",
              "Delete selected messages"
            )}
            className="grid size-7 shrink-0 place-items-center text-[#4f5b66] hover:text-[#20252a] disabled:opacity-35 @min-[400px]:block @min-[400px]:size-auto @min-[400px]:text-[10px] @min-[400px]:leading-4 @min-[400px]:font-semibold @min-[400px]:tracking-[0.06em] @min-[400px]:uppercase dark:text-[#a7b0ba] dark:hover:text-[#eef2f4]"
            disabled={selectedMessageCount === 0}
            type="button"
            onClick={() => void onMoveCheckedMessagesToSpecial("\\Trash")}
          >
            <IconTrash className="size-4 @min-[400px]:hidden" />
            <span className="hidden @min-[400px]:inline">
              {t("Удалить", "Delete")}
            </span>
          </button>
        </Tooltip>
        <Tooltip content={t("В спам", "Move to spam")}>
          <button
            aria-label={t(
              "Переместить выбранные письма в спам",
              "Move selected messages to spam"
            )}
            className="grid size-7 shrink-0 place-items-center text-[#4f5b66] hover:text-[#20252a] disabled:opacity-35 @min-[400px]:block @min-[400px]:size-auto @min-[400px]:text-[10px] @min-[400px]:leading-4 @min-[400px]:font-semibold @min-[400px]:tracking-[0.06em] @min-[400px]:uppercase dark:text-[#a7b0ba] dark:hover:text-[#eef2f4]"
            disabled={selectedMessageCount === 0}
            type="button"
            onClick={() => void onMoveCheckedMessagesToSpecial("\\Junk")}
          >
            <IconFolderX className="size-4 @min-[400px]:hidden" />
            <span className="hidden @min-[400px]:inline">
              {t("В спам", "Move to spam")}
            </span>
          </button>
        </Tooltip>
        <Tooltip
          content={
            syncLoading
              ? t("Запускаю проверку новых писем", "Starting mail check")
              : t(
                  "Проверить новые письма на почтовых серверах",
                  "Check mail servers for new messages"
                )
          }
        >
          <button
            aria-busy={syncLoading}
            aria-label={
              syncLoading
                ? t("Запускаю проверку новых писем", "Starting mail check")
                : t("Проверить новые письма", "Check for new messages")
            }
            className="ml-auto grid size-7 shrink-0 place-items-center text-[#4f5b66] hover:text-[#20252a] disabled:cursor-wait disabled:opacity-60 @min-[400px]:block @min-[400px]:size-auto @min-[400px]:text-[10px] @min-[400px]:leading-4 @min-[400px]:font-semibold @min-[400px]:tracking-[0.06em] @min-[400px]:uppercase dark:text-[#a7b0ba] dark:hover:text-[#eef2f4]"
            disabled={syncLoading}
            type="button"
            onClick={() => void onSyncLocal()}
          >
            {syncLoading ? (
              <IconLoader2 className="size-4 animate-spin @min-[400px]:hidden" />
            ) : (
              <IconRefresh className="size-4 @min-[400px]:hidden" />
            )}
            <span className="hidden @min-[400px]:inline">
              {syncLoading
                ? t("Проверяю…", "Checking…")
                : t("Обновить", "Refresh")}
            </span>
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
