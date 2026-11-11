import { SignatureEditor } from "./signature-editor"
import { formatUiMessage, type UiMessage } from "../ui-message"
import {
  getMailEditorLabels,
  getMailEditorCommands,
} from "./mail-editor-labels"
import { useMailLocale } from "@workspace/mail-design"
import { mailText } from "@workspace/mail-design/locale"
/* eslint-disable react-refresh/only-export-components -- editor block registry intentionally colocates block components with its context and command factory. */
import * as React from "react"
import IconDeviceFloppy from "@tabler/icons-react/dist/esm/icons/IconDeviceFloppy.mjs"
import IconExternalLink from "@tabler/icons-react/dist/esm/icons/IconExternalLink.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import IconPencil from "@tabler/icons-react/dist/esm/icons/IconPencil.mjs"
import IconSelector from "@tabler/icons-react/dist/esm/icons/IconSelector.mjs"
import IconSignature from "@tabler/icons-react/dist/esm/icons/IconSignature.mjs"
import IconX from "@tabler/icons-react/dist/esm/icons/IconX.mjs"
import {
  insertBlockNode,
  type EditorCommand,
  type EditorCustomBlock,
  type EditorInstance,
  type EditorSerializedNode,
  type RichTextEditorRef,
} from "@workspace/editor-ui"
import {
  type MailPreferencesDto,
  type MailSignatureComposeMode,
  type MailSignatureDto,
} from "@/lib/api-client"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Tooltip } from "@workspace/ui/components/tooltip"

import {
  createMailButtonBlockNode,
  createMailSignatureBlockNode,
  getSignatureForCompose,
  getErrorMessage,
  htmlToPlainText,
  isEmptyParagraphNode,
  mailButtonBlockToText,
  mailButtonBlockType,
  mailSignatureBlockToText,
  mailSignatureBlockType,
  serializeMailButtonBlock,
  serializeMailSignatureBlock,
  readString,
  type MailButtonBlockNode,
  type MailSignatureBlockNode,
} from "./compose-editor-utils"

export type SignatureBlockContextValue = {
  accountId: string
  defaultSignature: MailSignatureDto | null
  mode: MailSignatureComposeMode
  saveSignature: (request: {
    id?: string
    name: string
    html: string
  }) => Promise<MailSignatureDto>
  signatures: MailSignatureDto[]
}

type MailSignatureBlockProps = {
  attributes: React.HTMLAttributes<HTMLDivElement>
  children: React.ReactNode
  editor: EditorInstance
  element: MailSignatureBlockNode
  path: number[]
}

type MailButtonBlockProps = {
  attributes: React.HTMLAttributes<HTMLDivElement>
  children: React.ReactNode
  editor: EditorInstance
  element: MailButtonBlockNode
  path: number[]
}

export const SignatureBlockContext =
  React.createContext<SignatureBlockContextValue | null>(null)

export const mailSignatureCustomBlocks: EditorCustomBlock[] = [
  {
    type: mailButtonBlockType,
    component: MailButtonBlock as EditorCustomBlock["component"],
    serializeHtml: serializeMailButtonBlock,
    toText: mailButtonBlockToText,
  },
  {
    type: mailSignatureBlockType,
    component: MailSignatureBlock as EditorCustomBlock["component"],
    serializeHtml: serializeMailSignatureBlock,
    toText: mailSignatureBlockToText,
  },
]

export function createComposeCommands(
  accountId: string,
  composeMode: MailSignatureComposeMode,
  mailPreferences: MailPreferencesDto
): EditorCommand[] {
  return [
    ...getMailEditorCommands(),
    {
      blockType: mailButtonBlockType,
      description: mailText("CTA-кнопка со ссылкой", "CTA button with a link"),
      group: mailText("Письмо", "Message"),
      icon: <IconExternalLink className="size-4" />,
      id: "mail-button",
      kind: "block",
      keywords: [
        "button",
        "cta",
        "link",
        mailText("кнопка", "button"),
        mailText("ссылка", "link"),
      ],
      label: mailText("Кнопка", "Button"),
      run: ({ editor }) => {
        insertBlockNode(editor as EditorInstance, createMailButtonBlockNode())
      },
    },
    {
      blockType: mailSignatureBlockType,
      description: mailText(
        "Сохраненная подпись письма",
        "Saved email signature"
      ),
      group: mailText("Письмо", "Message"),
      icon: <IconSignature className="size-4" />,
      id: "mail-signature",
      kind: "block",
      keywords: [
        "signature",
        "sign",
        "footer",
        mailText("подпись", "signature"),
        mailText("футер", "footer"),
      ],
      label: mailText("Подпись", "Signature"),
      run: ({ editor }) => {
        insertBlockNode(
          editor as EditorInstance,
          createMailSignatureBlockNode(
            getSignatureForCompose(mailPreferences, accountId, composeMode),
            {
              accountId,
              mode: composeMode,
              source: "manual",
            }
          )
        )
      },
    },
  ]
}

function MailButtonBlock({
  attributes,
  children,
  editor,
  element,
  path,
}: MailButtonBlockProps) {
  const { t } = useMailLocale()

  const [text, setText] = React.useState(
    readString(element.buttonText) || t("Перейти", "Open")
  )
  const [url, setUrl] = React.useState(readString(element.buttonUrl))
  const [trackClicks, setTrackClicks] = React.useState(
    element.buttonTrackClicks === true
  )
  const [editing, setEditing] = React.useState(!readString(element.buttonUrl))
  const [error, setError] = React.useState<UiMessage | null>(null)

  function saveButtonBlock() {
    const nextText = text.trim()
    const nextUrl = url.trim()

    if (!nextText || !nextUrl) {
      setError(["Нужен текст кнопки и URL", "Enter button text and a URL"])
      return
    }

    editor.tf.setNodes(
      {
        buttonText: nextText,
        buttonTrackClicks: trackClicks,
        buttonUrl: nextUrl,
      },
      { at: path }
    )
    setError(null)
    setEditing(false)
  }

  return (
    <div
      {...attributes}
      className="group/mail-button my-3"
      data-mail-button-block="true"
    >
      <div
        className="grid gap-2"
        contentEditable={false}
        onKeyDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {editing ? (
          <div className="grid gap-3 border border-[#d8dee5] bg-[#fbfcfd] p-3 dark:border-[#30353a] dark:bg-[#131619]">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
              <Input
                className="h-9 border border-[#cfd6dd] bg-white px-2 text-sm shadow-none focus-visible:ring-0 dark:border-[#30353a] dark:bg-[#181b1f]"
                placeholder={t("Текст кнопки", "Button text")}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
              <Input
                className="h-9 border border-[#cfd6dd] bg-white px-2 text-sm shadow-none focus-visible:ring-0 dark:border-[#30353a] dark:bg-[#181b1f]"
                placeholder="https://example.com"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-[#4c5661] dark:text-[#c4ccd4]">
                <Checkbox
                  checked={trackClicks}
                  onCheckedChange={(checked) =>
                    setTrackClicks(checked === true)
                  }
                />
                {t("Отслеживать клики по кнопке", "Track button clicks")}{" "}
              </label>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  {t("Отмена", "Cancel")}{" "}
                </Button>
                <Button size="sm" type="button" onClick={saveButtonBlock}>
                  {t("Сохранить", "Save")}{" "}
                </Button>
              </div>
            </div>
            {error ? (
              <p className="text-xs text-[#963828] dark:text-[#ffb3a7]">
                {formatUiMessage(error)}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <a
              className="inline-flex h-9 items-center justify-center border border-[#20252a] bg-[#20252a] px-4 text-sm font-semibold text-white no-underline dark:border-[#eef2f4] dark:bg-[#eef2f4] dark:text-[#181b1f]"
              href={url || "#"}
              onClick={(event) => event.preventDefault()}
            >
              {text || t("Кнопка", "Button")}
            </a>
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setEditing(true)}
            >
              <IconPencil className="size-4" />
              {t("Изменить", "Edit")}{" "}
            </Button>
            {trackClicks ? (
              <span className="text-xs font-medium text-[#68727d] dark:text-[#a7b0ba]">
                {t("клики отслеживаются", "click tracking enabled")}{" "}
              </span>
            ) : null}
          </div>
        )}
      </div>
      <span className="sr-only">{children}</span>
    </div>
  )
}

function MailSignatureBlock({
  attributes,
  children,
  editor,
  element,
  path,
}: MailSignatureBlockProps) {
  const { t } = useMailLocale()

  const context = React.useContext(SignatureBlockContext)
  const storedHtml = readString(element.signatureHtml)
  const contextDefaultSignature = context?.defaultSignature
  const defaultHtml = contextDefaultSignature?.html ?? ""
  const html = storedHtml || defaultHtml
  const [editing, setEditing] = React.useState(!html)
  const [name, setName] = React.useState(
    readString(element.signatureName) ||
      contextDefaultSignature?.name ||
      t("Основная подпись", "Main signature")
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<UiMessage | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false)
  const signatureEditorRef = React.useRef<RichTextEditorRef | null>(null)
  const currentSignatureId = readString(element.signatureId)
  const canApplyDefault =
    Boolean(contextDefaultSignature) &&
    (contextDefaultSignature?.id !== currentSignatureId ||
      contextDefaultSignature?.html !== storedHtml)

  async function saveSignatureFromBlock() {
    if (!context) {
      return
    }

    const nextHtml = signatureEditorRef.current?.getHtml() ?? html

    if (!htmlToPlainText(nextHtml)) {
      setError(["Подпись не может быть пустой", "Signature cannot be empty"])
      return
    }

    setSaving(true)
    setError(null)

    try {
      const signature = await context.saveSignature({
        id: readString(element.signatureId) || context.defaultSignature?.id,
        name,
        html: nextHtml,
      })

      editor.tf.setNodes(
        {
          signatureAccountId: context.accountId,
          signatureDirty: true,
          signatureHtml: signature.html,
          signatureId: signature.id,
          signatureMode: context.mode,
          signatureName: signature.name,
          signatureSource: "manual",
        },
        { at: path }
      )
      setEditing(false)
      setSaveDialogOpen(false)
    } catch (saveError) {
      setError(getErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  function applyDefaultSignature() {
    const signature = context?.defaultSignature

    if (!signature) {
      return
    }

    editor.tf.setNodes(
      {
        signatureAccountId: context.accountId,
        signatureDirty: true,
        signatureHtml: signature.html,
        signatureId: signature.id,
        signatureMode: context.mode,
        signatureName: signature.name,
        signatureSource: "manual",
      },
      { at: path }
    )
    setName(signature.name)
    setEditing(false)
  }

  function requestSaveSignatureDecision() {
    const nextHtml = signatureEditorRef.current?.getHtml() ?? html

    if (!htmlToPlainText(nextHtml)) {
      setError(["Подпись не может быть пустой", "Signature cannot be empty"])
      return
    }

    setError(null)
    setSaveDialogOpen(true)
  }

  function selectSavedSignature(signatureId: string) {
    const signature = context?.signatures.find(
      (item) => item.id === signatureId
    )

    if (!context || !signature) {
      return
    }

    editor.tf.setNodes(
      {
        signatureAccountId: context.accountId,
        signatureDirty: true,
        signatureHtml: signature.html,
        signatureId: signature.id,
        signatureMode: context.mode,
        signatureName: signature.name,
        signatureSource: "manual",
      },
      { at: path }
    )
    setName(signature.name)
    setEditing(false)
  }

  function applySignatureToMessage() {
    const nextHtml = signatureEditorRef.current?.getHtml() ?? html

    if (!htmlToPlainText(nextHtml)) {
      setError(["Подпись не может быть пустой", "Signature cannot be empty"])
      return
    }

    editor.tf.setNodes(
      {
        signatureAccountId: context?.accountId,
        signatureDirty: true,
        signatureHtml: nextHtml,
        signatureId: undefined,
        signatureMode: context?.mode,
        signatureName: name,
        signatureSource: "manual",
      },
      { at: path }
    )
    setError(null)
    setEditing(false)
    setSaveDialogOpen(false)
  }

  function removeSignatureBlock() {
    const nextNode = (
      editor as unknown as { children?: EditorSerializedNode[] }
    ).children?.[path[0] + 1]

    if (isEmptyParagraphNode(nextNode)) {
      editor.tf.removeNodes({ at: [path[0] + 1] })
    }

    editor.tf.removeNodes({ at: path })
  }

  return (
    <div
      {...attributes}
      className="group/mail-signature my-3 -ml-[42px] grid grid-cols-[42px_minmax(0,1fr)] items-start"
      data-mail-signature-block="true"
    >
      <div
        className="flex items-center justify-end gap-0.5 pt-3 pr-1 opacity-60 transition group-hover/mail-signature:opacity-100 focus-within:opacity-100"
        contentEditable={false}
        onKeyDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("Выбрать подпись", "Choose signature")}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <IconSelector className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-72 w-64 overflow-y-auto rounded-md border-[#d8dee5] bg-white text-[#20252a] dark:border-[#30353a] dark:bg-[#181b1f] dark:text-[#eef2f4]"
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel>{t("Подпись", "Signature")}</DropdownMenuLabel>
            {context?.signatures.length ? (
              context.signatures.map((signature) => (
                <DropdownMenuItem
                  key={signature.id}
                  onSelect={() => selectSavedSignature(signature.id)}
                >
                  <IconSignature className="size-4" />
                  <span className="min-w-0 flex-1 truncate">
                    {signature.name}
                  </span>
                  {signature.id === currentSignatureId ? (
                    <span className="text-xs text-[#68727d] dark:text-[#a7b0ba]">
                      {t("выбрана", "selected")}{" "}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <IconPencil className="size-4" />
                {t("Создать подпись", "Create signature")}{" "}
              </DropdownMenuItem>
            )}
            {canApplyDefault ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={applyDefaultSignature}>
                  <IconSignature className="size-4" />
                  {t("Обновить основную", "Update main signature")}{" "}
                </DropdownMenuItem>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <IconPencil className="size-4" />
              {t("Одноразовая подпись", "One-time signature")}{" "}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={removeSignatureBlock}>
              <IconX className="size-4" />
              {t("Без подписи", "No signature")}{" "}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip
          content={
            editing
              ? t("Сохранить подпись", "Save signature")
              : t("Изменить подпись", "Edit signature")
          }
        >
          <Button
            aria-label={
              editing
                ? t("Сохранить подпись", "Save signature")
                : t("Изменить подпись", "Edit signature")
            }
            size="icon-xs"
            type="button"
            variant="ghost"
            onClick={() =>
              editing ? requestSaveSignatureDecision() : setEditing(true)
            }
          >
            {editing ? (
              <IconDeviceFloppy className="size-3.5" />
            ) : (
              <IconPencil className="size-3.5" />
            )}
          </Button>
        </Tooltip>
      </div>
      <div
        className="grid min-w-0 gap-3 border-t border-[#d8dee5] pt-3 dark:border-[#30353a]"
        contentEditable={false}
        onKeyDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          {html && !editing ? (
            <div
              className="mail-signature-preview min-w-0 text-sm leading-5 text-[#20252a] dark:text-[#d7dde3]"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : !editing ? (
            <p className="text-sm text-[#68727d] dark:text-[#a7b0ba]">
              {t("Подпись не настроена", "Signature is not set up")}{" "}
            </p>
          ) : null}
        </div>

        {editing ? (
          <div className="grid gap-3 border border-[#d8dee5] bg-[#fbfcfd] p-3 dark:border-[#30353a] dark:bg-[#131619]">
            <Input
              className="h-9 border border-[#cfd6dd] bg-white px-2 text-sm shadow-none focus-visible:ring-0 dark:border-[#30353a] dark:bg-[#181b1f]"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <SignatureEditor
              commands={getMailEditorCommands()}
              labels={getMailEditorLabels()}
              className="bg-white dark:bg-[#181b1f]"
              initialHtml={html}
              minHeight={120}
              placeholder={t("Текст подписи", "Signature text")}
              preset="email"
              ref={signatureEditorRef}
              style={
                {
                  "--editor-ui-editor-padding": "8px 10px",
                  "--editor-ui-radius": "4px",
                } as React.CSSProperties
              }
              variant="framed"
            />
            {error ? (
              <p className="text-xs text-[#963828] dark:text-[#ffb3a7]">
                {formatUiMessage(error)}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                disabled={saving}
                size="sm"
                type="button"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                {t("Отмена", "Cancel")}{" "}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {saveDialogOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-3 backdrop-blur-[1px]"
          data-editor-ui-overlay="true"
          role="dialog"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <section className="w-full max-w-[420px] rounded-md border border-[#d8dee5] bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.24)] dark:border-[#30353a] dark:bg-[#181b1f]">
            <h3 className="text-base font-semibold">
              {t("Сохранить подпись?", "Save signature?")}
            </h3>
            <div className="mt-3 grid gap-2">
              <Label className="text-xs font-semibold text-[#68727d] dark:text-[#a7b0ba]">
                {t("Название", "Name")}{" "}
              </Label>
              <Input
                className="h-9 border border-[#cfd6dd] bg-white px-2 text-sm shadow-none focus-visible:ring-0 dark:border-[#30353a] dark:bg-[#181b1f]"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {error ? (
              <p className="mt-3 text-xs text-[#963828] dark:text-[#ffb3a7]">
                {formatUiMessage(error)}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                disabled={saving}
                type="button"
                variant="ghost"
                onClick={() => setSaveDialogOpen(false)}
              >
                {t("Отмена", "Cancel")}{" "}
              </Button>
              <Button
                disabled={saving}
                type="button"
                variant="outline"
                onClick={applySignatureToMessage}
              >
                {t("Только в письме", "Only in this message")}{" "}
              </Button>
              <Button
                disabled={saving}
                type="button"
                onClick={() => void saveSignatureFromBlock()}
              >
                {saving ? (
                  <IconLoader2 className="size-4 animate-spin" />
                ) : (
                  <IconDeviceFloppy className="size-4" />
                )}
                {t("Сохранить шаблон", "Save template")}{" "}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
      <span className="sr-only">{children}</span>
    </div>
  )
}
