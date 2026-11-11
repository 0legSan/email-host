export type {
  MailAccountView,
  MailAddressView,
  MailAttachmentView,
  MailConversationView,
  MailFolderView,
  MailMessageView,
  MailProfileView,
  MailThreadMessageView,
} from "./types/mail"
export type { AsyncStatus, MailPaneStatus } from "./types/states"
export { EmailHostLogo } from "./components/brand/email-host-logo"
export {
  MailComposeSurface,
  type MailComposeViewMode,
} from "./components/compose/compose-surface"
export {
  MailPaneState,
  MailSessionChecking,
} from "./components/feedback/mail-status"
export { MailWorkspace } from "./components/layout/mail-workspace"
export {
  MailMessageListBody,
  MailMessageListFrame,
  MailMessageListHeader,
  MailMessageRowFrame,
} from "./components/message-list/message-list-primitives"
export {
  MailConversationList,
  MailConversationRow,
  MailConversationSummary,
  MailConversationSurface,
  MailReaderSurface,
} from "./components/reader/reader-primitives"
export { MailSenderAvatar } from "./components/reader/sender-avatar"
export {
  MailboxIcon,
  MailSidebarFrame,
  MailSidebarHeader,
  MailSidebarRow,
  MailSidebarSectionLabel,
} from "./components/sidebar/sidebar-primitives"
export { MailSettingsSurface } from "./components/settings/settings-surface"
export {
  MailThemeProvider,
  useMailTheme,
  type MailTheme,
  type ResolvedMailTheme,
} from "./components/theme/theme-provider"
export { MailThemeToggle } from "./components/theme/theme-toggle"
export {
  MailAccentPicker,
  MailAppearanceSettings,
} from "./components/theme/appearance-settings"
export type { MailAccent } from "./components/theme/appearance-storage"
export { useMailLocale } from "./i18n/use-mail-locale"
export {
  MailDocumentLanguage,
  MailLanguagePicker,
} from "./i18n/language-controls"
export {
  getMailLocale,
  getMailIntlLocale,
  mailText,
  setMailLocale,
  type MailLocale,
} from "./i18n/mail-locale"
