import type * as React from "react"
import type { Value } from "platejs"
import type { PlateElementProps } from "platejs/react"

export type EditorPreset = "crm" | "email" | "full" | "notes" | "site"

export type EditorFeature =
  | "autoformat"
  | "basicBlocks"
  | "blockSelection"
  | "codeBlocks"
  | "dragAndDrop"
  | "html"
  | "links"
  | "lists"
  | "markdown"
  | "marks"
  | "media"
  | "richBlocks"
  | "slash"
  | "tables"
  | "toolbars"

export type EditorCommandKind = "action" | "block" | "inline" | "mark"

export type EditorCommandContext = {
  editor: unknown
  command: EditorCommand
  preset: EditorPreset
  closeMenu?: () => void
  focusEditor?: () => void
}

export type EditorCommand = {
  id: string
  group: string
  label: string
  kind: EditorCommandKind
  run: (context: EditorCommandContext) => void
  blockType?: string
  description?: string
  enabled?: (context: Omit<EditorCommandContext, "command">) => boolean
  feature?: EditorFeature
  icon?: React.ReactNode
  keywords?: string[]
  presets?: EditorPreset[]
}

export type EditorSerializedNode = {
  children?: EditorSerializedNode[]
  text?: string
  type?: string
  [key: string]: unknown
}

export type EditorCustomBlock = {
  type: string
  component: React.FunctionComponent<PlateElementProps>
  serializeHtml?: (node: EditorSerializedNode) => string
  toText?: (node: EditorSerializedNode) => string
}

export type EditorLabels = {
  addBlock: string
  blockType: string
  bold: string
  bulletedList: string
  code: string
  divider: string
  fixedToolbar: string
  floatingToolbar: string
  heading: string
  insert: string
  italic: string
  link: string
  linkPrompt: string
  numberedList: string
  paragraph: string
  quote: string
  redo: string
  slashEmpty: string
  strikethrough: string
  subheading: string
  turnInto: string
  underline: string
  undo: string
}

export type EditorComponentOverrides = {
  BlockDraggable: React.ComponentType<unknown>
  BlockSelection: React.ComponentType<unknown>
  FixedToolbar: React.ComponentType<unknown>
  FloatingToolbar: React.ComponentType<unknown>
  InlineCombobox: React.ComponentType<unknown>
  SlashInput: React.ComponentType<unknown>
}

export type EditorSlotClassNames = {
  block: string
  blockMenu: string
  canvas: string
  combobox: string
  content: string
  dragHandle: string
  dropLine: string
  editor: string
  fixedToolbar: string
  floatingToolbar: string
  gutter: string
  insertButton: string
  menu: string
  selection: string
  toolbar: string
}

export type RichTextEditorVariant = "document" | "framed" | "plain"

export type RichTextEditorBaseProps = {
  className?: string
  commands?: EditorCommand[]
  components?: Partial<EditorComponentOverrides>
  customBlocks?: EditorCustomBlock[]
  features?: Partial<Record<EditorFeature, boolean>>
  initialHtml?: string
  initialValue?: Value
  labels?: Partial<EditorLabels>
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

export type RichTextEditorHandle = {
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

export type EditorUploadContext = {
  editor: unknown
  file: File
  placeholderId: string
  preset: EditorPreset
}

export type EditorAsset = {
  id: string
  name: string
  url: string
  contentType?: string
  size?: number
}

export type EditorUploadAdapter = {
  upload: (file: File, context: EditorUploadContext) => Promise<EditorAsset>
}
