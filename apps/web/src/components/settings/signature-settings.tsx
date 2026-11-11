import { SignatureEditor } from "../compose/signature-editor"
import { formatUiMessage, type UiMessage } from "../ui-message"
import {
  getMailEditorLabels,
  getMailEditorCommands,
} from "../compose/mail-editor-labels"
import { useMailLocale } from "@workspace/mail-design"
import { mailText } from "@workspace/mail-design/locale"
import * as React from "react"
import IconDeviceFloppy from "@tabler/icons-react/dist/esm/icons/IconDeviceFloppy.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconSignature from "@tabler/icons-react/dist/esm/icons/IconSignature.mjs"
import { type RichTextEditorRef } from "@workspace/editor-ui"
import {
  type MailAccountDto,
  type MailPreferencesDto,
  type MailSignatureComposeMode,
  type MailSignatureDto,
  updateMailSignatureDefaults,
  upsertMailSignature,
} from "@/lib/api-client"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import {
  SettingsError,
  SettingsField,
  SettingsSelectField,
} from "./settings-shared"
import { getAccountLabel } from "./account-settings-model"

const settingsInputClassName =
  "h-10 rounded-none border-[#cfd6dd] bg-white text-[#20252a] shadow-none focus-visible:border-mail-accent focus-visible:ring-mail-accent/20 dark:border-[#3a424b] dark:bg-[#111315] dark:text-[#eef2f4]"
const settingsSelectTriggerClassName = `${settingsInputClassName} !h-10 justify-between`

export function SignatureSettingsPanel({
  accounts,
  mailPreferences,
  onMailPreferencesChange,
}: {
  accounts: MailAccountDto[]
  mailPreferences: MailPreferencesDto
  onMailPreferencesChange: (
    preferences: MailPreferencesDto
  ) => MailPreferencesDto
}) {
  const { t } = useMailLocale()

  const scopeOptions = [
    { value: "global", label: t("Все ящики", "All accounts") },
    ...accounts.map((account) => ({
      value: account.id,
      label: getAccountLabel(account),
    })),
  ]
  const [scopeAccountId, setScopeAccountId] = React.useState("global")
  const scopeAccountValue = scopeAccountId === "global" ? null : scopeAccountId
  const defaultSignature = getSignatureForScope(
    mailPreferences,
    scopeAccountValue,
    "new"
  )
  const [selectedSignatureIdOverride, setSelectedSignatureIdOverride] =
    React.useState<string | null>(null)
  const selectedSignatureId =
    selectedSignatureIdOverride ?? defaultSignature?.id ?? "new"
  const selectedSignature =
    mailPreferences.signatures.items.find(
      (signature) => signature.id === selectedSignatureId
    ) ?? null
  const scopeAccount =
    accounts.find((account) => account.id === scopeAccountValue) ?? null
  const selectedSignatureName =
    selectedSignature?.name ?? t("Основная подпись", "Main signature")
  const selectedSignatureKey = selectedSignature?.id ?? "new"
  const [nameState, setNameState] = React.useState<{
    signatureKey: string
    value: string | null
  }>(() => ({
    signatureKey: selectedSignatureKey,
    value: null,
  }))
  const name =
    nameState.signatureKey === selectedSignatureKey
      ? (nameState.value ?? selectedSignatureName)
      : selectedSignatureName
  const [saving, setSaving] = React.useState(false)
  const [defaultsSaving, setDefaultsSaving] = React.useState(false)
  const [error, setError] = React.useState<UiMessage | null>(null)
  const editorRef = React.useRef<RichTextEditorRef | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const html = editorRef.current?.getHtml() ?? selectedSignature?.html ?? ""

      if (!htmlToPlainText(html)) {
        setError(["Подпись не может быть пустой", "Signature cannot be empty"])
        return
      }

      const isNewSignature = !selectedSignature
      const data = await upsertMailSignature({
        accountId: selectedSignature?.accountId ?? scopeAccountValue,
        id: selectedSignature?.id,
        name,
        html,
        defaultFor: isNewSignature
          ? {
              accountId: scopeAccountValue,
              modes: ["new", "reply", "forward"],
            }
          : undefined,
        makeDefault: false,
      })
      const preferences = onMailPreferencesChange(data.preferences)
      const savedSignature =
        preferences.signatures.items.find(
          (signature) =>
            signature.id === selectedSignature?.id ||
            (signature.name === name && signature.html === html)
        ) ?? preferences.signatures.items[0]

      if (savedSignature) {
        setSelectedSignatureIdOverride(savedSignature.id)
        setNameState({
          signatureKey: savedSignature.id,
          value: savedSignature.name,
        })
      }
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  async function updateDefaultSignature(
    mode: MailSignatureComposeMode,
    value: string
  ) {
    setDefaultsSaving(true)
    setError(null)

    try {
      const data = await updateMailSignatureDefaults({
        accountId: scopeAccountValue,
        defaults: {
          [mode]: value === "none" ? null : value,
        },
      })

      onMailPreferencesChange(data.preferences)
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setDefaultsSaving(false)
    }
  }

  function applySignatureTemplate(template: SignatureTemplate) {
    const html = createSignatureTemplateHtml(template, {
      account: scopeAccount,
      name,
    })

    editorRef.current?.setHtml(html)
  }

  function handleScopeAccountChange(value: string) {
    setScopeAccountId(value)
    setSelectedSignatureIdOverride(null)
  }

  function handleSignatureIdChange(value: string) {
    setSelectedSignatureIdOverride(value)
  }

  function handleSignatureNameChange(value: string) {
    setNameState({
      signatureKey: selectedSignatureKey,
      value,
    })
  }

  return (
    <div className="grid min-w-0 gap-6 @3xl/settings:grid-cols-[minmax(0,1fr)_320px]">
      <form
        className="grid min-w-0 content-start gap-4 border border-[#d8dee5] bg-[#fbfcfd] p-4 dark:border-[#30353a] dark:bg-[#131619]"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="flex items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center bg-[#151719] text-white dark:bg-[#f6f3ef] dark:text-[#111315]">
            <IconSignature className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {t("Шаблон подписи", "Signature template")}
            </h3>
            <p className="text-xs text-[#68727d] dark:text-[#a7b0ba]">
              {t(
                "Сохраняется один раз и автоматически добавляется в письма.",
                "Saved once and added to messages automatically."
              )}{" "}
            </p>
          </div>
        </div>

        <SettingsSelectField label={t("Редактировать", "Edit")}>
          <Select
            value={selectedSignatureId}
            onValueChange={handleSignatureIdChange}
          >
            <SelectTrigger className={settingsSelectTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">
                {t("Новая подпись", "New signature")}
              </SelectItem>
              {mailPreferences.signatures.items.map((signature) => (
                <SelectItem key={signature.id} value={signature.id}>
                  {signature.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsSelectField>

        <SettingsField label={t("Название", "Name")}>
          <Input
            className={settingsInputClassName}
            value={name}
            onChange={(event) => handleSignatureNameChange(event.target.value)}
          />
        </SettingsField>

        <div className="grid gap-2">
          <span className="text-xs font-semibold text-[#4c5661] dark:text-[#c4ccd4]">
            {t("Шаблон", "Template")}{" "}
          </span>
          <div className="flex flex-wrap gap-2">
            {signatureTemplates.map((template) => (
              <Button
                key={template}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => applySignatureTemplate(template)}
              >
                {getSignatureTemplateLabels()[template]}
              </Button>
            ))}
          </div>
        </div>

        <SignatureEditor
          commands={getMailEditorCommands()}
          labels={getMailEditorLabels()}
          key={selectedSignature?.id ?? `new-signature-${scopeAccountId}`}
          className="bg-white dark:bg-[#181b1f]"
          initialHtml={selectedSignature?.html ?? ""}
          minHeight={180}
          placeholder={t(
            "Например: имя, роль, телефон, сайт",
            "For example: name, role, phone, website"
          )}
          preset="email"
          ref={editorRef}
          style={
            {
              "--editor-ui-editor-padding": "10px 12px",
              "--editor-ui-radius": "4px",
            } as React.CSSProperties
          }
        />

        {error ? <SettingsError>{formatUiMessage(error)}</SettingsError> : null}

        <div className="flex justify-end">
          <Button disabled={saving} type="submit">
            {saving ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconDeviceFloppy className="size-4" />
            )}
            {selectedSignature
              ? t("Сохранить", "Save")
              : t("Создать подпись", "Create signature")}
          </Button>
        </div>
      </form>

      <section className="grid min-w-0 content-start gap-4 border border-[#d8dee5] bg-[#fbfcfd] p-4 dark:border-[#30353a] dark:bg-[#131619]">
        <div className="grid gap-3">
          <h3 className="text-sm font-semibold">
            {t("Автоподстановка", "Automatic insertion")}
          </h3>
          <SettingsSelectField label={t("Ящик", "Account")}>
            <Select
              value={scopeAccountId}
              onValueChange={handleScopeAccountChange}
            >
              <SelectTrigger className={settingsSelectTriggerClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsSelectField>

          {signatureComposeModes.map((mode) => (
            <SettingsSelectField
              key={mode}
              label={getSignatureModeLabels()[mode]}
            >
              <Select
                disabled={defaultsSaving}
                value={
                  getSignatureDefaultId(
                    mailPreferences,
                    scopeAccountValue,
                    mode
                  ) ?? "none"
                }
                onValueChange={(value) =>
                  void updateDefaultSignature(mode, value)
                }
              >
                <SelectTrigger className={settingsSelectTriggerClassName}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    {t("Без подписи", "No signature")}
                  </SelectItem>
                  {mailPreferences.signatures.items.map((signature) => (
                    <SelectItem key={signature.id} value={signature.id}>
                      {signature.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsSelectField>
          ))}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold">
            {t("Превью", "Preview")}
          </h3>
          {selectedSignature?.html ? (
            <div
              className="mail-signature-preview border border-[#e2e7eb] bg-white p-3 text-sm leading-5 text-[#20252a] dark:border-[#2b3035] dark:bg-[#181b1f] dark:text-[#d7dde3]"
              dangerouslySetInnerHTML={{ __html: selectedSignature.html }}
            />
          ) : (
            <p className="py-10 text-center text-sm text-[#68727d] dark:text-[#a7b0ba]">
              {t(
                "Подпись еще не настроена",
                "Signature is not set up yet"
              )}{" "}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

const signatureComposeModes: MailSignatureComposeMode[] = [
  "new",
  "reply",
  "forward",
]

function getSignatureModeLabels(): Record<MailSignatureComposeMode, string> {
  return {
    new: mailText("Новое письмо", "New message"),
    reply: mailText("Ответ", "Reply"),
    forward: mailText("Пересылка", "Forward"),
  }
}

type SignatureTemplate = "classic" | "contact" | "short"

const signatureTemplates: SignatureTemplate[] = ["classic", "contact", "short"]

function getSignatureTemplateLabels(): Record<SignatureTemplate, string> {
  return {
    classic: mailText("Классический", "Classic"),
    contact: mailText("Контактный", "Contact"),
    short: mailText("Короткий", "Short"),
  }
}

function getSignatureForScope(
  mailPreferences: MailPreferencesDto,
  accountId: string | null,
  mode: MailSignatureComposeMode
): MailSignatureDto | null {
  const defaultId = getSignatureDefaultId(mailPreferences, accountId, mode)

  return (
    mailPreferences.signatures.items.find(
      (signature) => signature.id === defaultId
    ) ?? null
  )
}

function getSignatureDefaultId(
  mailPreferences: MailPreferencesDto,
  accountId: string | null,
  mode: MailSignatureComposeMode
) {
  const accountDefaults = accountId
    ? mailPreferences.signatures.defaults.accounts[accountId]
    : undefined

  if (accountDefaults && Object.hasOwn(accountDefaults, mode)) {
    return accountDefaults[mode] ?? null
  }

  return mailPreferences.signatures.defaults.global[mode] ?? null
}

function createSignatureTemplateHtml(
  template: SignatureTemplate,
  context: {
    account: MailAccountDto | null
    name: string
  }
) {
  const name =
    context.account?.displayName?.trim() ||
    context.name.trim() ||
    getNameFromAddress(context.account?.address ?? "")
  const email = context.account?.address

  if (template === "contact" && email) {
    return mailText(
      `<p>С уважением,<br>${escapeHtml(name)}<br><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>`,
      `<p>Best regards,<br>${escapeHtml(name)}<br><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>`
    )
  }

  if (template === "short") {
    return `<p>${escapeHtml(name)}</p>`
  }

  return mailText(
    `<p>С уважением,<br>${escapeHtml(name)}</p>`,
    `<p>Best regards,<br>${escapeHtml(name)}</p>`
  )
}

function getNameFromAddress(address: string) {
  const localPart = address.split("@")[0]?.trim()

  return localPart || mailText("Имя", "Name")
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim()
}

function getErrorMessage(error: unknown): UiMessage {
  if (error instanceof Error) {
    return error.message
  }

  return ["Неизвестная ошибка", "Unknown error"]
}
