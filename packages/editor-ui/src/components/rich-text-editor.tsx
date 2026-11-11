import { defaultEditorLabels, type RichTextEditorLabels } from "./editor-labels"
import { EditorLabelsContext } from "./editor-label-context"
import * as React from "react"
import {
  flip,
  offset,
  useFloatingToolbar,
  useFloatingToolbarState,
} from "@platejs/floating"
import { upsertLink } from "@platejs/link"
import { ListStyleType, someList, toggleList } from "@platejs/list"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { KEYS, type Value } from "platejs"
import {
  Plate,
  PlateContainer,
  PlateContent,
  useEditorRef,
  useEditorId,
  useEditorSelector,
  useEventEditorValue,
  useMarkToolbarButton,
  useMarkToolbarButtonState,
  usePlateEditor,
  usePluginOption,
} from "platejs/react"

import { createDefaultEditorCommands, getListCommandId } from "../commands"
import { EditorCommandsContext } from "./editor-command-context"
import { createEditorKit } from "../lib/block-editor-kit"
import {
  deserializeHtmlToEditorValue,
  editorValueToPlainText,
  emptyEditorValue,
  serializeEditorValueToHtml,
} from "../lib/html"
import {
  getBlockType,
  insertBlock,
  setBlockType,
  type EditorInstance,
} from "../lib/editor-transforms"
import type {
  EditorCommand,
  EditorComponentOverrides,
  EditorCustomBlock,
  EditorFeature,
  EditorLabels,
  EditorPreset,
  EditorSlotClassNames,
  RichTextEditorVariant,
} from "../types/editor"

export type { RichTextEditorLabels } from "./editor-labels"

export type RichTextEditorRef = {
  clear: () => void
  focus: () => void
  getHtml: () => string
  getText: () => string
  getValue: () => Value
  insertBlock: (type: string) => void
  redo: () => void
  setHtml: (html: string) => void
  setValue: (value: Value) => void
  undo: () => void
}

export type RichTextEditorProps = {
  className?: string
  commands?: EditorCommand[]
  components?: Partial<EditorComponentOverrides>
  customBlocks?: EditorCustomBlock[]
  features?: Partial<Record<EditorFeature, boolean>>
  initialHtml?: string
  initialValue?: Value
  labels?: RichTextEditorLabels & Partial<EditorLabels>
  minHeight?: number
  onHtmlChange?: (html: string) => void
  onValueChange?: (value: Value) => void
  placeholder?: string
  preset?: EditorPreset
  readOnly?: boolean
  slotClassNames?: Partial<EditorSlotClassNames>
  style?: React.CSSProperties
  value?: Value
  variant?: RichTextEditorVariant
}

const emptyCustomBlocks: EditorCustomBlock[] = []

export const RichTextEditor = React.forwardRef<
  RichTextEditorRef,
  RichTextEditorProps
>(function RichTextEditor(
  {
    className,
    commands: commandsProp,
    customBlocks = emptyCustomBlocks,
    features,
    initialHtml,
    initialValue,
    labels: labelOverrides,
    minHeight = 280,
    placeholder,
    preset = "email",
    readOnly = false,
    slotClassNames,
    style,
    value,
    variant = "framed",
    onHtmlChange,
    onValueChange,
  },
  ref
) {
  const labels = React.useMemo(
    () => ({
      ...defaultEditorLabels,
      ...labelOverrides,
    }),
    [labelOverrides]
  )
  const resolvedInitialValue = React.useMemo(
    () =>
      value ??
      initialValue ??
      (initialHtml
        ? deserializeHtmlToEditorValue(initialHtml)
        : emptyEditorValue),
    [initialHtml, initialValue, value]
  )
  const plugins = React.useMemo(
    () =>
      createEditorKit({
        customBlocks,
        features,
        preset,
      }),
    [customBlocks, features, preset]
  )
  const editor = usePlateEditor(
    {
      plugins,
      value: resolvedInitialValue,
    },
    [plugins]
  )
  const htmlChangeTimeoutRef = React.useRef<number | null>(null)
  const onHtmlChangeRef = React.useRef(onHtmlChange)
  const onValueChangeRef = React.useRef(onValueChange)
  const commands = React.useMemo(
    () =>
      commandsProp ??
      createDefaultEditorCommands({
        labels,
        features,
        preset,
      }),
    [commandsProp, features, labels, preset]
  )

  React.useLayoutEffect(() => {
    onHtmlChangeRef.current = onHtmlChange
    onValueChangeRef.current = onValueChange
  }, [onHtmlChange, onValueChange])

  React.useEffect(() => {
    editor.tf.setValue(resolvedInitialValue)
    onValueChangeRef.current?.(resolvedInitialValue)
    onHtmlChangeRef.current?.(
      serializeEditorValueToHtml(resolvedInitialValue, customBlocks)
    )
  }, [customBlocks, editor, resolvedInitialValue])

  React.useEffect(
    () => () => {
      if (htmlChangeTimeoutRef.current !== null) {
        window.clearTimeout(htmlChangeTimeoutRef.current)
      }
    },
    []
  )

  React.useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        editor.tf.setValue(emptyEditorValue)
        onValueChange?.(emptyEditorValue)
        onHtmlChange?.(
          serializeEditorValueToHtml(emptyEditorValue, customBlocks, labels)
        )
      },
      focus: () => editor.tf.focus(),
      getHtml: () =>
        serializeEditorValueToHtml(editor.children, customBlocks, labels),
      getText: () => editorValueToPlainText(editor.children, customBlocks),
      getValue: () => editor.children,
      insertBlock: (type: string) => {
        insertBlock(editor as unknown as EditorInstance, type, { upsert: true })
      },
      redo: () => editor.redo(),
      setHtml: (html: string) => {
        const nextValue = deserializeHtmlToEditorValue(html)
        editor.tf.setValue(nextValue)
        onValueChange?.(nextValue)
        onHtmlChange?.(
          serializeEditorValueToHtml(nextValue, customBlocks, labels)
        )
      },
      setValue: (value: Value) => {
        editor.tf.setValue(value)
        onValueChange?.(value)
        onHtmlChange?.(serializeEditorValueToHtml(value, customBlocks, labels))
      },
      undo: () => editor.undo(),
    }),
    [customBlocks, editor, labels, onHtmlChange, onValueChange]
  )

  const handleChange = React.useCallback(
    ({ value }: { value: Value }) => {
      onValueChangeRef.current?.(value)

      if (!onHtmlChangeRef.current) {
        return
      }

      if (htmlChangeTimeoutRef.current !== null) {
        window.clearTimeout(htmlChangeTimeoutRef.current)
      }

      htmlChangeTimeoutRef.current = window.setTimeout(() => {
        onHtmlChangeRef.current?.(
          serializeEditorValueToHtml(value, customBlocks, labels)
        )
      }, 120)
    },
    [customBlocks, labels]
  )

  return (
    <div
      className={["editor-ui editor-ui-editor", className]
        .concat(slotClassNames?.editor ?? [])
        .filter(Boolean)
        .join(" ")}
      data-preset={preset}
      data-variant={variant}
      style={
        {
          ...style,
          "--editor-ui-editor-min-height": `${minHeight}px`,
        } as React.CSSProperties
      }
    >
      <Plate editor={editor} onChange={handleChange}>
        <EditorLabelsContext.Provider value={labels}>
          <EditorCommandsContext.Provider value={commands}>
            {features?.toolbars === false ? null : (
              <SelectionFloatingToolbar commands={commands} labels={labels} />
            )}
            <PlateContainer
              className={["editor-ui-editor__body", slotClassNames?.canvas]
                .filter(Boolean)
                .join(" ")}
            >
              <PlateContent
                className={[
                  "editor-ui-editor__content",
                  slotClassNames?.content,
                ]
                  .filter(Boolean)
                  .join(" ")}
                disableDefaultStyles
                placeholder={placeholder ?? labels.placeholder}
                readOnly={readOnly}
              />
            </PlateContainer>
          </EditorCommandsContext.Provider>
        </EditorLabelsContext.Provider>
      </Plate>
    </div>
  )
})

function SelectionFloatingToolbar({
  commands,
  labels,
}: {
  commands: EditorCommand[]
  labels: Required<RichTextEditorLabels>
}) {
  const editorId = useEditorId()
  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false)
  const focusedEditorId = useEventEditorValue("focus")
  const isFloatingLinkOpen = !!usePluginOption({ key: KEYS.link }, "mode")
  const state = useFloatingToolbarState({
    editorId,
    focusedEditorId,
    hideToolbar: isFloatingLinkOpen,
    floatingOptions: {
      middleware: [
        offset(8),
        flip({
          fallbackPlacements: [
            "top-start",
            "top-end",
            "bottom-start",
            "bottom-end",
          ],
          padding: 8,
        }),
      ],
      placement: "top",
    },
  })
  const {
    clickOutsideRef,
    hidden,
    props: floatingProps,
    ref: floatingRef,
  } = useFloatingToolbar(state)

  // The URL dialog is portaled outside the toolbar. Keep its owner mounted
  // when focus moves into the dialog and the selection toolbar hides.
  if (hidden && !linkDialogOpen) {
    return null
  }

  return (
    <div ref={clickOutsideRef}>
      <div
        {...floatingProps}
        className="editor-ui-floating-toolbar"
        contentEditable={false}
        ref={floatingRef}
        role="toolbar"
      >
        <ToolbarControls
          commands={commands}
          labels={labels}
          linkDialogOpen={linkDialogOpen}
          onLinkDialogOpenChange={setLinkDialogOpen}
        />
      </div>
    </div>
  )
}

function ToolbarControls({
  commands,
  labels,
  linkDialogOpen,
  onLinkDialogOpenChange,
}: {
  commands: EditorCommand[]
  labels: Required<RichTextEditorLabels>
  linkDialogOpen: boolean
  onLinkDialogOpenChange: (open: boolean) => void
}) {
  return (
    <>
      <BlockMenu commands={commands} labels={labels} />
      <span className="editor-ui-editor__toolbar-separator" />
      <div className="editor-ui-editor__toolbar-group">
        <MarkButton ariaLabel={labels.bold} label="B" nodeType={KEYS.bold} />
        <MarkButton
          ariaLabel={labels.italic}
          label="I"
          nodeType={KEYS.italic}
        />
        <MarkButton
          ariaLabel={labels.underline}
          label="U"
          nodeType={KEYS.underline}
        />
        <MarkButton
          ariaLabel={labels.strikethrough}
          label="S"
          nodeType={KEYS.strikethrough}
        />
        <MarkButton ariaLabel={labels.code} label="{}" nodeType={KEYS.code} />
      </div>
      <span className="editor-ui-editor__toolbar-separator" />
      <div className="editor-ui-editor__toolbar-group">
        <ListButton
          ariaLabel={labels.bulletedList}
          label="•"
          listStyleType={KEYS.ul}
        />
        <ListButton
          ariaLabel={labels.numberedList}
          label="1."
          listStyleType={KEYS.ol}
        />
        <LinkButton
          labels={labels}
          open={linkDialogOpen}
          onOpenChange={onLinkDialogOpenChange}
        />
        <DividerButton ariaLabel={labels.divider} />
      </div>
    </>
  )
}

function BlockMenu({
  commands,
  labels,
}: {
  commands: EditorCommand[]
  labels: Required<RichTextEditorLabels>
}) {
  const editor = useEditorRef()
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const turnIntoCommands = React.useMemo(
    () =>
      commands.filter(
        (command) => command.blockType && isTurnIntoBlockType(command.blockType)
      ),
    [commands]
  )
  const currentCommandId = useEditorSelector((editor) => {
    const block = editor.api.block()

    if (!block) {
      return "paragraph"
    }

    const type = getBlockType(block[0])
    const listCommandId = getListCommandId(type)

    if (listCommandId) {
      return listCommandId
    }

    if (type === KEYS.h1) {
      return "h1"
    }

    if (type === KEYS.h2) {
      return "heading"
    }

    if (type === KEYS.h3) {
      return "subheading"
    }

    if (type === KEYS.h4) {
      return "h4"
    }

    if (type === KEYS.h5) {
      return "h5"
    }

    if (type === KEYS.h6) {
      return "h6"
    }

    if (type === KEYS.blockquote) {
      return "quote"
    }

    return "paragraph"
  }, [])
  const currentCommand =
    turnIntoCommands.find((command) => command.id === currentCommandId) ??
    turnIntoCommands[0]!
  const currentCommandIndex = Math.max(
    0,
    turnIntoCommands.findIndex((command) => command.id === currentCommand.id)
  )

  React.useEffect(() => {
    if (!open) {
      return
    }

    menuRef.current
      ?.querySelector<HTMLElement>(
        `[data-editor-ui-command-index="${activeIndex}"]`
      )
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, open])

  React.useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)

    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  const runCommand = React.useCallback(
    (command: EditorCommand) => {
      if (command.blockType) {
        setBlockType(editor as unknown as EditorInstance, command.blockType)
      }

      editor.tf.focus()
      setOpen(false)
    },
    [editor]
  )

  const openBlockMenu = React.useCallback(() => {
    setActiveIndex(currentCommandIndex)
    setOpen(true)
  }, [currentCommandIndex])

  const toggleBlockMenu = React.useCallback(() => {
    if (open) {
      setOpen(false)
      return
    }

    openBlockMenu()
  }, [open, openBlockMenu])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (
        event.key === "ArrowDown" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault()
        openBlockMenu()
      }

      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % turnIntoCommands.length)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex(
        (index) =>
          (index - 1 + turnIntoCommands.length) % turnIntoCommands.length
      )
      return
    }

    if (event.key === "Home") {
      event.preventDefault()
      setActiveIndex(0)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      setActiveIndex(turnIntoCommands.length - 1)
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      const command = turnIntoCommands[activeIndex]

      if (command) {
        runCommand(command)
      }

      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      setOpen(false)
      editor.tf.focus()
    }
  }

  return (
    <div
      className="editor-ui-editor__block-menu"
      ref={menuRef}
      onKeyDown={handleKeyDown}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={labels.blockType}
        className="editor-ui-editor__block-button"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={toggleBlockMenu}
      >
        <span className="editor-ui-editor__block-icon" aria-hidden="true">
          {currentCommand.icon}
        </span>
        <span className="editor-ui-editor__block-label">
          {currentCommand.label}
        </span>
        <span className="editor-ui-editor__block-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <CommandMenu
          activeIndex={activeIndex}
          commands={turnIntoCommands}
          onCommand={runCommand}
        />
      ) : null}
    </div>
  )
}

function isTurnIntoBlockType(type: string) {
  const turnIntoTypes: string[] = [
    KEYS.p,
    KEYS.h1,
    KEYS.h2,
    KEYS.h3,
    KEYS.h4,
    KEYS.h5,
    KEYS.h6,
    KEYS.blockquote,
    KEYS.ul,
    KEYS.ol,
  ]

  return turnIntoTypes.includes(type)
}

function MarkButton({
  ariaLabel,
  label,
  nodeType,
}: {
  ariaLabel: string
  label: string
  nodeType: string
}) {
  const state = useMarkToolbarButtonState({ nodeType })
  const { props } = useMarkToolbarButton(state)
  const { pressed, ...buttonProps } = props

  return (
    <button
      {...buttonProps}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className="editor-ui-editor__button"
      type="button"
    >
      {label}
    </button>
  )
}

function ListButton({
  ariaLabel,
  label,
  listStyleType,
}: {
  ariaLabel: string
  label: string
  listStyleType: string
}) {
  const editor = useEditorRef()
  const pressed = useEditorSelector(
    (editor) =>
      someList(editor, [
        listStyleType,
        listStyleType === KEYS.ol ? ListStyleType.Decimal : ListStyleType.Disc,
      ]),
    [listStyleType]
  )

  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className="editor-ui-editor__button"
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        toggleList(editor, { listStyleType })
        editor.tf.focus()
      }}
    >
      {label}
    </button>
  )
}

function LinkButton({
  labels,
  open,
  onOpenChange,
}: {
  labels: Required<RichTextEditorLabels>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const editor = useEditorRef()
  const [url, setUrl] = React.useState("")
  const [linkError, setLinkError] = React.useState(false)
  const [trackClicks, setTrackClicks] = React.useState(false)
  const selectionRef = React.useRef<typeof editor.selection>(editor.selection)

  function restoreSelection() {
    if (selectionRef.current) editor.tf.select(selectionRef.current)
  }

  function handleOpen() {
    // The URL field takes focus away from Slate. Keep the insertion range
    // through dialog focus changes and live label updates.
    if (editor.selection)
      selectionRef.current = structuredClone(editor.selection)
    setUrl("")
    setLinkError(false)
    setTrackClicks(false)
    onOpenChange(true)
  }

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)

    if (!nextOpen) {
      restoreSelection()
      editor.tf.focus()
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // React events from a portal still bubble into the compose form.
    event.stopPropagation()
    const nextUrl = url.trim()

    if (!nextUrl) {
      return
    }

    restoreSelection()
    const inserted = upsertLink(editor, { url: nextUrl })
    if (!inserted) {
      setLinkError(true)
      return
    }
    const link = editor.api.above({
      match: { type: editor.getType(KEYS.link) },
    })
    if (link) editor.tf.setNodes({ trackClicks }, { at: link[1] })
    onOpenChange(false)
    editor.tf.focus()
  }

  return (
    <>
      <button
        aria-label={labels.link}
        className="editor-ui-editor__button"
        type="button"
        onMouseDown={(event) => {
          event.preventDefault()
          if (editor.selection)
            selectionRef.current = structuredClone(editor.selection)
        }}
        onClick={handleOpen}
      >
        ↗
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[440px]" showCloseButton={false}>
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-2 right-2"
              aria-label={labels.close}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </Button>
          </DialogClose>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{labels.link}</DialogTitle>
              <DialogDescription>{labels.linkPrompt}</DialogDescription>
            </DialogHeader>
            <label className="grid gap-1.5 text-xs font-semibold text-[#4c5661] dark:text-[#c4ccd4]">
              URL
              <Input
                autoFocus
                className="h-10 border border-[#cfd6dd] bg-white px-3 text-sm dark:border-[#30353a] dark:bg-[#181b1f]"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-xs leading-5 text-[#4c5661] dark:text-[#c4ccd4]">
              <Checkbox
                checked={trackClicks}
                className="mt-0.5"
                onCheckedChange={(value) => setTrackClicks(value === true)}
              />
              <span>{labels.linkTrackClicks}</span>
            </label>
            {linkError ? <p role="alert">{labels.invalidLink}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleOpenChange(false)}
              >
                {labels.cancel}
              </Button>
              <Button disabled={!url.trim()} type="submit">
                {labels.insertLink}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DividerButton({ ariaLabel }: { ariaLabel: string }) {
  const editor = useEditorRef()

  return (
    <button
      aria-label={ariaLabel}
      className="editor-ui-editor__button"
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        insertBlock(editor as unknown as EditorInstance, KEYS.hr)
        editor.tf.focus()
      }}
    >
      ―
    </button>
  )
}

function CommandMenu({
  activeIndex = -1,
  commands,
  emptyLabel,
  onCommand,
}: {
  activeIndex?: number
  commands: EditorCommand[]
  emptyLabel?: string
  onCommand: (command: EditorCommand) => void
}) {
  if (commands.length === 0) {
    return (
      <div
        className="editor-ui-editor__menu"
        data-editor-ui-overlay="true"
        role="menu"
      >
        <div className="editor-ui-editor__menu-empty">{emptyLabel}</div>
      </div>
    )
  }

  return (
    <div
      className="editor-ui-editor__menu"
      data-editor-ui-overlay="true"
      role="menu"
    >
      {commands.map((command, index) => (
        <button
          aria-selected={index === activeIndex}
          className="editor-ui-editor__menu-item"
          data-editor-ui-command-index={index}
          key={command.id}
          role="menuitem"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onCommand(command)}
        >
          <span className="editor-ui-editor__menu-icon" aria-hidden="true">
            {command.icon}
          </span>
          <span className="editor-ui-editor__menu-copy">
            <span className="editor-ui-editor__menu-title">
              {command.label}
            </span>
            <span className="editor-ui-editor__menu-description">
              {command.description ?? command.label}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
