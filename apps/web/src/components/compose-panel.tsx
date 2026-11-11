import { formatUiMessage, type UiMessage } from "./ui-message"
import { getMailEditorLabels } from "./compose/mail-editor-labels"
import { useMailLocale } from "@workspace/mail-design"
import { mailText } from "@workspace/mail-design/locale"
import * as React from "react"
import { MailComposeSurface } from "@workspace/mail-design/compose"
import IconAlertCircle from "@tabler/icons-react/dist/esm/icons/IconAlertCircle.mjs"
import IconArrowsMaximize from "@tabler/icons-react/dist/esm/icons/IconArrowsMaximize.mjs"
import IconArrowsMinimize from "@tabler/icons-react/dist/esm/icons/IconArrowsMinimize.mjs"
import IconFileText from "@tabler/icons-react/dist/esm/icons/IconFileText.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconMinus from "@tabler/icons-react/dist/esm/icons/IconMinus.mjs"
import IconPaperclip from "@tabler/icons-react/dist/esm/icons/IconPaperclip.mjs"
import IconSend from "@tabler/icons-react/dist/esm/icons/IconSend.mjs"
import IconSignature from "@tabler/icons-react/dist/esm/icons/IconSignature.mjs"
import IconX from "@tabler/icons-react/dist/esm/icons/IconX.mjs"
import {
  RichTextEditor,
  emptyEditorValue,
  type EditorSerializedNode,
  type RichTextEditorRef,
} from "@workspace/editor-ui"

import {
  apiFetch,
  type MailAccountDto,
  type MailContactDto,
  type MailPreferencesDto,
  type MailSignatureDto,
  upsertMailSignature,
} from "@/lib/api-client"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Tooltip } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import {
  SignatureBlockContext,
  createComposeCommands,
  mailSignatureCustomBlocks,
  type SignatureBlockContextValue,
} from "./compose/compose-editor-blocks"
import {
  createInitialComposeEditorValue,
  fileToSendMessageAttachment,
  getErrorMessage,
  getSignatureDefaultId,
  getSignatureForCompose,
  hasComposeSignatureBlock,
  htmlToPlainText,
  normalizeComposeEditorValue,
  parseAddressInput,
  replaceAutomaticSignatureBlock,
  serializeComposeEditorValue,
  setComposeSignatureBlock,
  type ComposeAttachment,
  type ComposeEditorValue,
} from "./compose/compose-editor-utils"
import { RecipientAutocompleteInput } from "./compose/recipient-autocomplete-input"

export type ComposeInitialValues = {
  title: string
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  html: string
  referenceMessageId?: string
  mode: "new" | "reply" | "forward"
}

export type ComposeDraftValues = {
  accountId: string
  editorValue?: ComposeEditorValue
  to: string
  cc: string
  bcc: string
  subject: string
  html: string
  trackOpens: boolean
  trackClicks: boolean
}

export type ComposeViewMode = "floating" | "modal" | "page"

function getComposeViewModeOptions(): Array<{
  mode: ComposeViewMode
  label: string
  icon: React.ComponentType<{ className?: string }>
}> {
  return [
    {
      mode: "floating",
      label: mailText("Плавающее окно", "Floating window"),
      icon: IconArrowsMinimize,
    },
    {
      mode: "modal",
      label: mailText("Модальное окно", "Modal window"),
      icon: IconArrowsMaximize,
    },
    {
      mode: "page",
      label: mailText("Отдельная страница", "Separate page"),
      icon: IconFileText,
    },
  ]
}

const composeFieldLabelClassName =
  "w-14 shrink-0 text-xs font-semibold text-[#68727d] dark:text-[#a7b0ba]"

const composeControlClassName =
  "h-8 w-full border-0 bg-transparent px-0 text-sm font-normal shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 dark:bg-transparent"

export function ComposePanel({
  accounts,
  contacts,
  defaultAccountId,
  draft,
  initialValues,
  mailPreferences,
  viewMode,
  onDiscard,
  onDraftChange,
  onMailPreferencesChange,
  onMinimize,
  onSaveDraftAndClose,
  onSent,
  onViewModeChange,
}: {
  accounts: MailAccountDto[]
  contacts: MailContactDto[]
  defaultAccountId: string
  draft?: ComposeDraftValues | null
  initialValues: ComposeInitialValues | null
  mailPreferences: MailPreferencesDto
  viewMode: ComposeViewMode
  onDiscard: () => void
  onDraftChange?: (draft: ComposeDraftValues) => void
  onMailPreferencesChange: (
    preferences: MailPreferencesDto
  ) => MailPreferencesDto
  onMinimize: () => void
  onSaveDraftAndClose: () => void
  onSent: () => void
  onViewModeChange: (viewMode: ComposeViewMode) => void
}) {
  const { t } = useMailLocale()

  const [initialDraft] = React.useState(() => draft)
  const composeMode = initialValues?.mode ?? "new"
  const [initialEditorHtml] = React.useState(
    () => initialDraft?.html ?? initialValues?.html ?? ""
  )
  const [accountId, setAccountId] = React.useState(
    () =>
      initialDraft?.accountId || initialValues?.accountId || defaultAccountId
  )
  const [initialEditorValue] = React.useState(() => {
    if (initialDraft?.editorValue) {
      return initialDraft.editorValue
    }

    const initialAccountId =
      initialDraft?.accountId || initialValues?.accountId || defaultAccountId

    return createInitialComposeEditorValue({
      accountId: initialAccountId,
      html: initialEditorHtml,
      mode: composeMode,
      signature: getSignatureForCompose(
        mailPreferences,
        initialAccountId,
        composeMode
      ),
    })
  })
  const [to, setTo] = React.useState(
    () => initialDraft?.to ?? initialValues?.to ?? ""
  )
  const [cc, setCc] = React.useState(
    () => initialDraft?.cc ?? initialValues?.cc ?? ""
  )
  const [bcc, setBcc] = React.useState(
    () => initialDraft?.bcc ?? initialValues?.bcc ?? ""
  )
  const [subject, setSubject] = React.useState(
    () => initialDraft?.subject ?? initialValues?.subject ?? ""
  )
  const [html, setHtml] = React.useState(initialEditorHtml)
  const [editorValue, setEditorValue] = React.useState<
    ComposeEditorValue | undefined
  >(initialEditorValue)
  const [trackOpens, setTrackOpens] = React.useState(
    () => initialDraft?.trackOpens ?? true
  )
  const [attachments, setAttachments] = React.useState<ComposeAttachment[]>([])
  const [sending, setSending] = React.useState(false)
  const [sendError, setSendError] = React.useState<UiMessage | null>(null)
  const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false)
  const attachmentInputRef = React.useRef<HTMLInputElement | null>(null)
  const editorRef = React.useRef<RichTextEditorRef | null>(null)
  const editorValueRef = React.useRef(editorValue)
  const titleId = React.useId()
  const accountSelectId = React.useId()
  const toInputId = React.useId()
  const ccInputId = React.useId()
  const bccInputId = React.useId()
  const subjectInputId = React.useId()
  const trackOpensId = React.useId()
  const hasSignature = hasComposeSignatureBlock(editorValue)
  const composeCommands = createComposeCommands(
    accountId,
    composeMode,
    mailPreferences
  )
  const defaultSignature = React.useMemo(
    () => getSignatureForCompose(mailPreferences, accountId, composeMode),
    [accountId, composeMode, mailPreferences]
  )

  const saveSignature = React.useCallback(
    async (request: { id?: string; name: string; html: string }) => {
      const data = await upsertMailSignature({
        ...request,
        accountId,
        defaultFor: {
          accountId,
          modes: [composeMode],
        },
      })
      const preferences = onMailPreferencesChange(data.preferences)

      return (
        preferences.signatures.items.find(
          (signature) =>
            signature.id ===
            getSignatureDefaultId(preferences, accountId, composeMode)
        ) ??
        preferences.signatures.items.find(
          (signature) => signature.id === request.id
        ) ??
        preferences.signatures.items[0]!
      )
    },
    [accountId, composeMode, onMailPreferencesChange]
  )
  const signatureContextValue = React.useMemo<SignatureBlockContextValue>(
    () => ({
      accountId,
      defaultSignature,
      mode: composeMode,
      saveSignature,
      signatures: mailPreferences.signatures.items,
    }),
    [
      accountId,
      composeMode,
      defaultSignature,
      mailPreferences.signatures.items,
      saveSignature,
    ]
  )

  const publishDraft = React.useCallback(
    (
      nextHtml: string = html,
      nextEditorValue: ComposeEditorValue | undefined = editorValue
    ) => {
      const nextDraft = {
        accountId,
        editorValue: nextEditorValue,
        to,
        cc,
        bcc,
        subject,
        html: nextHtml,
        trackOpens,
        trackClicks: false,
      }

      onDraftChange?.(nextDraft)
      return nextDraft
    },
    [
      accountId,
      bcc,
      cc,
      editorValue,
      html,
      onDraftChange,
      subject,
      to,
      trackOpens,
    ]
  )

  React.useEffect(() => {
    publishDraft()
  }, [publishDraft])

  React.useEffect(() => {
    editorValueRef.current = editorValue
  }, [editorValue])

  const getEditorValue = React.useCallback(
    () =>
      normalizeComposeEditorValue(
        (editorRef.current?.getValue() ??
          editorValue ??
          emptyEditorValue) as EditorSerializedNode[]
      ),
    [editorValue]
  )
  const getEditorHtml = React.useCallback(
    () => serializeComposeEditorValue(getEditorValue()),
    [getEditorValue]
  )

  const applyComposeEditorValue = React.useCallback(
    (nextValue: ComposeEditorValue) => {
      const normalizedValue = normalizeComposeEditorValue(
        nextValue as EditorSerializedNode[]
      )

      editorValueRef.current = normalizedValue
      setEditorValue(normalizedValue)

      if (editorRef.current) {
        editorRef.current.setValue(normalizedValue)
      }
    },
    []
  )

  const syncAutomaticSignature = React.useCallback(
    (nextAccountId: string) => {
      const currentValue =
        editorRef.current?.getValue() ?? editorValueRef.current
      const result = replaceAutomaticSignatureBlock({
        accountId: nextAccountId,
        mode: composeMode,
        signature: getSignatureForCompose(
          mailPreferences,
          nextAccountId,
          composeMode
        ),
        value: currentValue,
      })

      if (!result.changed) {
        return
      }

      applyComposeEditorValue(result.value)
    },
    [applyComposeEditorValue, composeMode, mailPreferences]
  )

  function handleAccountIdChange(nextAccountId: string) {
    setAccountId(nextAccountId)
    syncAutomaticSignature(nextAccountId)
  }

  React.useEffect(() => {
    syncAutomaticSignature(accountId)
  }, [accountId, syncAutomaticSignature])

  function setEditorSignature(signature: MailSignatureDto | null) {
    const currentValue = editorRef.current?.getValue() ?? editorValueRef.current
    const nextValue = setComposeSignatureBlock({
      accountId,
      mode: composeMode,
      signature,
      source: "manual",
      value: currentValue,
    })

    applyComposeEditorValue(nextValue)
  }

  function createSignatureInEditor() {
    const currentValue = editorRef.current?.getValue() ?? editorValueRef.current
    const nextValue = setComposeSignatureBlock({
      accountId,
      mode: composeMode,
      signature: null,
      source: "manual",
      value: currentValue,
      withEmptyBlock: true,
    })

    applyComposeEditorValue(nextValue)
  }

  function toggleEditorSignature() {
    if (hasComposeSignatureBlock(getEditorValue())) {
      setEditorSignature(null)
      return
    }

    const signature = defaultSignature ?? mailPreferences.signatures.items[0]

    if (signature) {
      setEditorSignature(signature)
      return
    }

    createSignatureInEditor()
  }

  function openAttachmentPicker() {
    attachmentInputRef.current?.click()
  }

  function handleAttachmentInputChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(event.target.files ?? [])

    if (!files.length) {
      return
    }

    setAttachments((current) => [
      ...current,
      ...files.map((file) => ({
        file,
        id: crypto.randomUUID(),
      })),
    ])
    event.target.value = ""
  }

  function removeAttachment(attachmentId: string) {
    setAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId)
    )
  }

  const minimizeComposer = React.useCallback(() => {
    publishDraft(getEditorHtml(), getEditorValue())
    onMinimize()
  }, [getEditorHtml, getEditorValue, onMinimize, publishDraft])

  const requestCloseComposer = React.useCallback(() => {
    publishDraft(getEditorHtml(), getEditorValue())
    setCloseConfirmOpen(true)
  }, [getEditorHtml, getEditorValue, publishDraft])

  const saveDraftAndClose = React.useCallback(() => {
    publishDraft(getEditorHtml(), getEditorValue())
    setCloseConfirmOpen(false)
    onSaveDraftAndClose()
  }, [getEditorHtml, getEditorValue, onSaveDraftAndClose, publishDraft])

  const discardAndClose = React.useCallback(() => {
    setCloseConfirmOpen(false)
    onDiscard()
  }, [onDiscard])

  const handleEditorHtmlChange = React.useCallback(() => {
    const normalizedValue = getEditorValue()
    const normalizedHtml = serializeComposeEditorValue(normalizedValue)

    setHtml(normalizedHtml)
    publishDraft(normalizedHtml, normalizedValue)
  }, [getEditorValue, publishDraft])

  const handleEditorValueChange = React.useCallback(
    (nextValue: ComposeEditorValue) => {
      const normalizedValue = normalizeComposeEditorValue(
        nextValue as EditorSerializedNode[]
      )

      editorValueRef.current = normalizedValue
      setEditorValue(normalizedValue)

      publishDraft(
        serializeComposeEditorValue(normalizedValue),
        normalizedValue
      )
    },
    [publishDraft]
  )

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    setSendError(null)
    const editorHtml = getEditorHtml()

    try {
      const recipients = parseAddressInput(to)
      const carbonCopyRecipients = parseAddressInput(cc)
      const blindCarbonCopyRecipients = parseAddressInput(bcc)
      const sendAttachments = attachments.length
        ? await Promise.all(attachments.map(fileToSendMessageAttachment))
        : undefined

      if (!accountId || recipients.length === 0) {
        setSendError([
          "Нужен аккаунт отправителя и хотя бы один получатель",
          "Choose a sender account and at least one recipient",
        ])
        return
      }

      await apiFetch<{ outboundMessage: unknown }>("/api/mail/send", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          clientRequestId: crypto.randomUUID(),
          accountId,
          to: recipients,
          cc: carbonCopyRecipients.length ? carbonCopyRecipients : undefined,
          bcc: blindCarbonCopyRecipients.length
            ? blindCarbonCopyRecipients
            : undefined,
          subject,
          html: editorHtml,
          text: editorRef.current?.getText() ?? htmlToPlainText(editorHtml),
          attachments: sendAttachments,
          referenceMessageId: initialValues?.referenceMessageId,
          mode: initialValues?.mode ?? "new",
          trackOpens,
        }),
      })
      onSent()
    } catch (error) {
      setSendError(getErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  const form = (
    <MailComposeSurface
      aria-labelledby={titleId}
      viewMode={viewMode}
      onSubmit={(event) => void sendMessage(event)}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#d8dee5] px-4 dark:border-[#30353a]">
        <h2 className="min-w-0 truncate text-base font-semibold" id={titleId}>
          {initialValues?.title ?? t("Новое письмо", "New message")}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <ComposeViewModeSwitch value={viewMode} onChange={onViewModeChange} />
          <Tooltip content={t("Свернуть", "Minimize")}>
            <Button
              aria-label={t("Свернуть редактор", "Minimize editor")}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={minimizeComposer}
            >
              <IconMinus className="size-4" />
            </Button>
          </Tooltip>
          <Tooltip content={t("Закрыть", "Close")}>
            <Button
              aria-label={t("Закрыть редактор", "Close editor")}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={requestCloseComposer}
            >
              <IconX className="size-4" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="grid shrink-0 border-b border-[#d8dee5] px-4 py-2 dark:border-[#30353a]">
        <div className="flex min-h-10 items-center gap-3 border-b border-[#edf1f4] last:border-b-0 dark:border-[#252b31]">
          <Label
            className={composeFieldLabelClassName}
            htmlFor={accountSelectId}
          >
            {t("От", "From")}{" "}
          </Label>
          <Select
            disabled={accounts.length === 0}
            value={accountId}
            onValueChange={handleAccountIdChange}
          >
            <SelectTrigger
              className={cn(
                composeControlClassName,
                "!h-8 justify-between rounded-none border-0 bg-transparent px-0 shadow-none focus:ring-0 focus:ring-offset-0 dark:bg-transparent"
              )}
              id={accountSelectId}
            >
              <SelectValue
                placeholder={t("Выбери ящик", "Choose an account")}
              />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-h-10 items-center gap-3 border-b border-[#edf1f4] last:border-b-0 dark:border-[#252b31]">
          <Label className={composeFieldLabelClassName} htmlFor={toInputId}>
            {t("Кому", "To")}{" "}
          </Label>
          <RecipientAutocompleteInput
            className={composeControlClassName}
            contacts={contacts}
            id={toInputId}
            placeholder="name@example.com"
            value={to}
            onChange={setTo}
          />
        </div>
        <div className="flex min-h-10 items-center gap-3 border-b border-[#edf1f4] last:border-b-0 dark:border-[#252b31]">
          <Label className={composeFieldLabelClassName} htmlFor={ccInputId}>
            {t("Копия", "Cc")}{" "}
          </Label>
          <RecipientAutocompleteInput
            className={composeControlClassName}
            contacts={contacts}
            id={ccInputId}
            placeholder="copy@example.com"
            value={cc}
            onChange={setCc}
          />
        </div>
        <div className="flex min-h-10 items-center gap-3 border-b border-[#edf1f4] last:border-b-0 dark:border-[#252b31]">
          <Label className={composeFieldLabelClassName} htmlFor={bccInputId}>
            {t("Скрытая", "Bcc")}{" "}
          </Label>
          <RecipientAutocompleteInput
            className={composeControlClassName}
            contacts={contacts}
            id={bccInputId}
            placeholder="hidden@example.com"
            value={bcc}
            onChange={setBcc}
          />
        </div>
        <div className="flex min-h-10 items-center gap-3 border-b border-[#edf1f4] last:border-b-0 dark:border-[#252b31]">
          <Label
            className={composeFieldLabelClassName}
            htmlFor={subjectInputId}
          >
            {t("Тема", "Subject")}{" "}
          </Label>
          <Input
            className={composeControlClassName}
            id={subjectInputId}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>
      </div>

      <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#d8dee5] px-4 py-1.5 dark:border-[#30353a]">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={trackOpens}
              id={trackOpensId}
              onCheckedChange={(checked) => setTrackOpens(checked === true)}
            />
            <Label
              className="text-xs font-normal text-[#4c5661] dark:text-[#c4ccd4]"
              htmlFor={trackOpensId}
            >
              {t("Отслеживать открытие", "Track opens")}{" "}
            </Label>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <input
            className="sr-only"
            multiple
            ref={attachmentInputRef}
            type="file"
            onChange={handleAttachmentInputChange}
          />
          <Tooltip content={t("Прикрепить файл", "Attach file")}>
            <Button
              aria-label={t("Прикрепить файл", "Attach file")}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={openAttachmentPicker}
            >
              <IconPaperclip className="size-4" />
            </Button>
          </Tooltip>
          <Tooltip
            content={
              hasSignature
                ? t("Убрать подпись", "Remove signature")
                : t("Добавить подпись", "Add signature")
            }
          >
            <Button
              aria-label={
                hasSignature
                  ? t("Убрать подпись", "Remove signature")
                  : t("Добавить подпись", "Add signature")
              }
              aria-pressed={hasSignature}
              className={cn(
                hasSignature &&
                  "bg-[#edf2f5] text-[#20252a] dark:bg-[#242a30] dark:text-[#eef2f4]"
              )}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={toggleEditorSignature}
            >
              <IconSignature className="size-4" />
            </Button>
          </Tooltip>
        </div>
        {attachments.length ? (
          <div className="flex basis-full flex-wrap items-center gap-1.5">
            {attachments.map((attachment) => (
              <span
                className="inline-flex h-6 max-w-full items-center gap-1 border border-[#d8dee5] bg-[#fbfcfd] px-2 text-xs text-[#4c5661] dark:border-[#30353a] dark:bg-[#131619] dark:text-[#c4ccd4]"
                key={attachment.id}
              >
                <IconPaperclip className="size-3 shrink-0" />
                <span className="max-w-[220px] truncate">
                  {attachment.file.name || t("Файл", "File")}
                </span>
                <button
                  aria-label={t(
                    `Убрать файл ${attachment.file.name || ""}`,
                    `Remove file ${attachment.file.name || ""}`
                  )}
                  className="ml-0.5 grid size-4 shrink-0 place-items-center text-[#68727d] hover:text-[#20252a] dark:text-[#a7b0ba] dark:hover:text-[#eef2f4]"
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                >
                  <IconX className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "custom-scrollbar min-h-0 flex-1 overflow-auto px-4 py-2",
          viewMode === "page" && "lg:px-6 lg:py-3"
        )}
      >
        <SignatureBlockContext.Provider value={signatureContextValue}>
          <RichTextEditor
            labels={getMailEditorLabels()}
            className="w-full"
            commands={composeCommands}
            customBlocks={mailSignatureCustomBlocks}
            initialHtml={initialEditorHtml}
            initialValue={initialEditorValue}
            minHeight={
              viewMode === "floating" ? 260 : viewMode === "modal" ? 420 : 520
            }
            placeholder={t(
              "Текст письма или / для блоков",
              "Message text or / for blocks"
            )}
            preset="email"
            ref={editorRef}
            style={
              {
                "--editor-ui-editor-padding": "8px 0 14px 42px",
                "--editor-ui-radius": "4px",
              } as React.CSSProperties
            }
            variant="plain"
            onHtmlChange={handleEditorHtmlChange}
            onValueChange={handleEditorValueChange}
          />
        </SignatureBlockContext.Provider>
      </div>

      {sendError ? (
        <div className="mx-4 mb-3 flex items-start gap-2 border border-[#e6b8b0] bg-[#fff4f1] p-3 text-sm text-[#963828] dark:border-[#6c3a33] dark:bg-[#281d1b] dark:text-[#ffb3a7]">
          <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{formatUiMessage(sendError)}</span>
        </div>
      ) : null}

      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-t border-[#d8dee5] px-4 dark:border-[#30353a]">
        <span className="min-w-0" />
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={minimizeComposer}>
            {t("Свернуть", "Minimize")}{" "}
          </Button>
          <Button disabled={sending} type="submit">
            {sending ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconSend className="size-4" />
            )}
            {t("Отправить", "Send")}{" "}
          </Button>
        </div>
      </div>
    </MailComposeSurface>
  )

  const closeConfirmation = closeConfirmOpen ? (
    <div
      aria-labelledby={`${titleId}-close-title`}
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-3 backdrop-blur-[1px]"
      data-editor-ui-overlay="true"
      role="dialog"
    >
      <section className="w-full max-w-[420px] rounded-md border border-[#d8dee5] bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.24)] dark:border-[#30353a] dark:bg-[#181b1f]">
        <h3 className="text-base font-semibold" id={`${titleId}-close-title`}>
          {t("Закрыть черновик?", "Close draft?")}{" "}
        </h3>
        <p className="mt-2 text-sm leading-5 text-[#4c5661] dark:text-[#c4ccd4]">
          {t(
            "Сохранить письмо как черновик или удалить его?",
            "Save this message as a draft or discard it?"
          )}{" "}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="destructive" onClick={discardAndClose}>
            {t("Не сохранять", "Discard")}{" "}
          </Button>
          <Button type="button" onClick={saveDraftAndClose}>
            {t("Сохранить черновик", "Save draft")}{" "}
          </Button>
        </div>
      </section>
    </div>
  ) : null

  if (viewMode === "floating") {
    return (
      <div className="fixed right-3 bottom-3 left-3 z-40 flex justify-end sm:right-5 sm:bottom-5 sm:left-auto">
        {form}
        {closeConfirmation}
      </div>
    )
  }

  if (viewMode === "modal") {
    return (
      <div
        className="fixed inset-0 z-40 grid place-items-center bg-black/45 p-3 backdrop-blur-[1px] sm:p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            minimizeComposer()
          }
        }}
      >
        {form}
        {closeConfirmation}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-[#f3f5f7] sm:p-4 dark:bg-[#101214]">
      {form}
      {closeConfirmation}
    </div>
  )
}

function ComposeViewModeSwitch({
  value,
  onChange,
}: {
  value: ComposeViewMode
  onChange: (viewMode: ComposeViewMode) => void
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-[#edf2f5] p-0.5 dark:bg-[#101214]">
      {getComposeViewModeOptions().map(({ mode, label, icon: Icon }) => (
        <Tooltip content={label} key={mode}>
          <Button
            aria-label={label}
            aria-pressed={value === mode}
            className={cn(
              "grid size-7 place-items-center rounded-[4px] text-[#68727d] transition hover:bg-white hover:text-[#20252a] focus-visible:ring-2 focus-visible:ring-[#1f8a70]/25 focus-visible:outline-none dark:text-[#a7b0ba] dark:hover:bg-[#242a30] dark:hover:text-[#eef2f4]",
              value === mode &&
                "bg-white text-[#20252a] shadow-sm dark:bg-[#242a30] dark:text-[#eef2f4]"
            )}
            size="icon-sm"
            type="button"
            variant="ghost"
            onClick={() => onChange(mode)}
          >
            <Icon className="size-4" />
          </Button>
        </Tooltip>
      ))}
    </div>
  )
}
