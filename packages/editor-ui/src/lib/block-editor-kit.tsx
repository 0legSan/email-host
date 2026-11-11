import { useEditorLabels } from "../components/editor-label-context"
import {
  BaseBlockquotePlugin,
  BaseBoldPlugin,
  BaseCodePlugin,
  BaseH1Plugin,
  BaseH2Plugin,
  BaseH3Plugin,
  BaseH4Plugin,
  BaseH5Plugin,
  BaseH6Plugin,
  BaseHighlightPlugin,
  BaseHorizontalRulePlugin,
  BaseItalicPlugin,
  BaseKbdPlugin,
  BaseStrikethroughPlugin,
  BaseSubscriptPlugin,
  BaseSuperscriptPlugin,
  BaseUnderlinePlugin,
} from "@platejs/basic-nodes"
import {
  BlockquotePlugin,
  BoldPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
  H4Plugin,
  H5Plugin,
  H6Plugin,
  HighlightPlugin,
  HorizontalRulePlugin,
  ItalicPlugin,
  KbdPlugin,
  StrikethroughPlugin,
  SubscriptPlugin,
  SuperscriptPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react"
import {
  autoformatArrow,
  AutoformatPlugin,
  autoformatLegal,
  autoformatLegalHtml,
  autoformatMath,
  autoformatPunctuation,
  autoformatSmartQuotes,
  type AutoformatRule,
} from "@platejs/autoformat"
import {
  BaseCodeBlockPlugin,
  BaseCodeLinePlugin,
  BaseCodeSyntaxPlugin,
} from "@platejs/code-block"
import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from "@platejs/code-block/react"
import { IndentPlugin } from "@platejs/indent/react"
import { BaseLinkPlugin, getLinkAttributes } from "@platejs/link"
import { LinkPlugin } from "@platejs/link/react"
import { BaseListPlugin, toggleList } from "@platejs/list"
import { ListPlugin } from "@platejs/list/react"
import { MarkdownPlugin } from "@platejs/markdown"
import {
  BaseFilePlugin,
  BaseImagePlugin,
  BaseMediaEmbedPlugin,
  BasePlaceholderPlugin,
} from "@platejs/media"
import {
  FilePlugin,
  ImagePlugin,
  MediaEmbedPlugin,
  PlaceholderPlugin,
} from "@platejs/media/react"
import { SlashInputPlugin, SlashPlugin } from "@platejs/slash-command/react"
import {
  BaseTableCellHeaderPlugin,
  BaseTableCellPlugin,
  BaseTablePlugin,
  BaseTableRowPlugin,
} from "@platejs/table"
import {
  TableCellHeaderPlugin,
  TableCellPlugin,
  TablePlugin,
  TableProvider,
  TableRowPlugin,
  useTableElement,
  useTableMergeState,
} from "@platejs/table/react"
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Combine,
  Trash2,
  Ungroup,
  X,
} from "lucide-react"
import {
  BaseParagraphPlugin,
  ExitBreakPlugin,
  KEYS,
  TrailingBlockPlugin,
  type TLinkElement,
} from "platejs"
import {
  ParagraphPlugin,
  PlateElement,
  PlateLeaf,
  createPlatePlugin,
  type PlateElementProps,
  type PlateLeafProps,
  useEditorPlugin,
  useReadOnly,
} from "platejs/react"

import { SlashInputElement } from "../components/slash-input-element"
import { BlockSelectionKit } from "../plugins/block-selection-kit"
import { DndKit } from "../plugins/dnd-kit"
import type {
  EditorCustomBlock,
  EditorFeature,
  EditorPreset,
} from "../types/editor"

export type CreateEditorKitOptions = {
  customBlocks?: EditorCustomBlock[]
  features?: Partial<Record<EditorFeature, boolean>>
  preset?: EditorPreset
}

export const BaseEditorKit = [
  BaseParagraphPlugin,
  BaseH1Plugin,
  BaseH2Plugin,
  BaseH3Plugin,
  BaseH4Plugin,
  BaseH5Plugin,
  BaseH6Plugin,
  BaseBlockquotePlugin,
  BaseHorizontalRulePlugin,
  BaseLinkPlugin,
  BaseListPlugin,
  BaseBoldPlugin,
  BaseItalicPlugin,
  BaseUnderlinePlugin,
  BaseStrikethroughPlugin,
  BaseCodePlugin,
  BaseHighlightPlugin,
  BaseKbdPlugin,
  BaseSubscriptPlugin,
  BaseSuperscriptPlugin,
  BaseCodeBlockPlugin,
  BaseCodeLinePlugin,
  BaseCodeSyntaxPlugin,
  BaseTablePlugin,
  BaseTableRowPlugin,
  BaseTableCellPlugin,
  BaseTableCellHeaderPlugin,
  BaseImagePlugin,
  BaseFilePlugin,
  BaseMediaEmbedPlugin,
  BasePlaceholderPlugin,
  MarkdownPlugin,
]

export const BaseBlockEditorKit = BaseEditorKit

const CoreEditorKit = [
  ParagraphPlugin.withComponent(ParagraphElement),
  H1Plugin.configure({
    node: { component: H1Element },
    rules: { break: { empty: "reset" } },
    shortcuts: { toggle: { keys: "mod+alt+1" } },
  }),
  H2Plugin.configure({
    node: { component: H2Element },
    rules: { break: { empty: "reset" } },
    shortcuts: { toggle: { keys: "mod+alt+2" } },
  }),
  H3Plugin.configure({
    node: { component: H3Element },
    rules: { break: { empty: "reset" } },
    shortcuts: { toggle: { keys: "mod+alt+3" } },
  }),
  H4Plugin.configure({
    node: { component: H4Element },
    rules: { break: { empty: "reset" } },
    shortcuts: { toggle: { keys: "mod+alt+4" } },
  }),
  H5Plugin.configure({
    node: { component: H5Element },
    rules: { break: { empty: "reset" } },
    shortcuts: { toggle: { keys: "mod+alt+5" } },
  }),
  H6Plugin.configure({
    node: { component: H6Element },
    rules: { break: { empty: "reset" } },
    shortcuts: { toggle: { keys: "mod+alt+6" } },
  }),
  BlockquotePlugin.configure({
    node: { component: BlockquoteElement },
    shortcuts: { toggle: { keys: "mod+shift+period" } },
  }),
  HorizontalRulePlugin.withComponent(HrElement),
  LinkPlugin.configure({
    node: { component: LinkElement },
  }),
  IndentPlugin.configure({
    inject: {
      targetPlugins: [
        KEYS.h1,
        KEYS.h2,
        KEYS.h3,
        KEYS.h4,
        KEYS.h5,
        KEYS.h6,
        KEYS.p,
        KEYS.blockquote,
      ],
    },
    options: { offset: 24 },
  }),
  ListPlugin.configure({
    inject: {
      targetPlugins: [
        KEYS.h1,
        KEYS.h2,
        KEYS.h3,
        KEYS.h4,
        KEYS.h5,
        KEYS.h6,
        KEYS.p,
        KEYS.blockquote,
      ],
    },
  }),
  ...createCodeBlockKit(),
  ...createTableKit(),
  ...createMediaKit(),
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  StrikethroughPlugin.configure({
    shortcuts: { toggle: { keys: "mod+shift+x" } },
  }),
  CodePlugin.configure({
    node: { component: CodeLeaf },
    shortcuts: { toggle: { keys: "mod+e" } },
  }),
  HighlightPlugin.configure({
    node: { component: HighlightLeaf },
    shortcuts: { toggle: { keys: "mod+shift+h" } },
  }),
  KbdPlugin.withComponent(KbdLeaf),
  SubscriptPlugin.configure({
    shortcuts: { toggle: { keys: "mod+comma" } },
  }),
  SuperscriptPlugin.configure({
    shortcuts: { toggle: { keys: "mod+period" } },
  }),
  SlashPlugin.configure({
    options: {
      triggerQuery: (editor) =>
        !editor.api.some({
          match: { type: editor.getType(KEYS.codeBlock) },
        }),
    },
  }),
  SlashInputPlugin.withComponent(SlashInputElement),
  AutoformatPlugin.configure({
    options: {
      enableUndoOnDelete: true,
      rules: createAutoformatRules(),
    },
  }),
  ExitBreakPlugin.configure({
    shortcuts: {
      insert: { keys: "mod+enter" },
      insertBefore: { keys: "mod+shift+enter" },
    },
  }),
  TrailingBlockPlugin,
]

const presetFeatureDefaults: Record<
  EditorPreset,
  Record<EditorFeature, boolean>
> = {
  crm: createFeatureDefaults({
    markdown: false,
    media: false,
  }),
  email: createFeatureDefaults({
    codeBlocks: true,
    markdown: false,
    media: true,
    richBlocks: true,
    tables: true,
  }),
  full: createFeatureDefaults(),
  notes: createFeatureDefaults({
    media: false,
    richBlocks: true,
  }),
  site: createFeatureDefaults(),
}

export function createEditorKit({
  customBlocks = [],
  features,
  preset = "email",
}: CreateEditorKitOptions = {}) {
  const enabled = resolveFeatureMap(preset, features)
  const customBlockPlugins = customBlocks.map((block) =>
    createPlatePlugin({
      key: block.type,
      node: {
        component: block.component,
        isElement: true,
      },
    })
  )

  return [
    ...(enabled.blockSelection ? BlockSelectionKit : []),
    ...customBlockPlugins,
    ...CoreEditorKit.filter((plugin) => {
      const key = "key" in plugin ? plugin.key : ""

      if (
        !enabled.codeBlocks &&
        isPluginKey(key, [KEYS.codeBlock, KEYS.codeLine, KEYS.codeSyntax])
      ) {
        return false
      }

      if (
        !enabled.tables &&
        isPluginKey(key, [KEYS.table, KEYS.tr, KEYS.td, KEYS.th])
      ) {
        return false
      }

      if (
        !enabled.media &&
        isPluginKey(key, [
          KEYS.img,
          KEYS.file,
          KEYS.mediaEmbed,
          KEYS.placeholder,
        ])
      ) {
        return false
      }

      if (!enabled.links && isPluginKey(key, [KEYS.link])) {
        return false
      }

      if (!enabled.lists && isPluginKey(key, [KEYS.list])) {
        return false
      }

      if (
        !enabled.slash &&
        isPluginKey(key, [SlashPlugin.key, SlashInputPlugin.key])
      ) {
        return false
      }

      if (!enabled.autoformat && plugin.key === AutoformatPlugin.key) {
        return false
      }

      return true
    }),
    ...(enabled.markdown ? [MarkdownPlugin] : []),
    ...(enabled.dragAndDrop ? DndKit : []),
  ]
}

export const EditorKit = createEditorKit({ preset: "full" })
export const BlockEditorKit = createEditorKit({ preset: "email" })

function ParagraphElement(props: PlateElementProps) {
  return (
    <PlateElement as="p" {...props}>
      {props.children}
    </PlateElement>
  )
}

function H1Element(props: PlateElementProps) {
  return (
    <PlateElement as="h1" {...props}>
      {props.children}
    </PlateElement>
  )
}

function H2Element(props: PlateElementProps) {
  return (
    <PlateElement as="h2" {...props}>
      {props.children}
    </PlateElement>
  )
}

function H3Element(props: PlateElementProps) {
  return (
    <PlateElement as="h3" {...props}>
      {props.children}
    </PlateElement>
  )
}

function H4Element(props: PlateElementProps) {
  return (
    <PlateElement as="h4" {...props}>
      {props.children}
    </PlateElement>
  )
}

function H5Element(props: PlateElementProps) {
  return (
    <PlateElement as="h5" {...props}>
      {props.children}
    </PlateElement>
  )
}

function H6Element(props: PlateElementProps) {
  return (
    <PlateElement as="h6" {...props}>
      {props.children}
    </PlateElement>
  )
}

function BlockquoteElement(props: PlateElementProps) {
  return (
    <PlateElement as="blockquote" {...props}>
      {props.children}
    </PlateElement>
  )
}

function HrElement(props: PlateElementProps) {
  return (
    <PlateElement {...props}>
      <div contentEditable={false}>
        <hr />
      </div>
      {props.children}
    </PlateElement>
  )
}

function CodeLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf as="code" {...props}>
      {props.children}
    </PlateLeaf>
  )
}

function HighlightLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf as="mark" {...props}>
      {props.children}
    </PlateLeaf>
  )
}

function KbdLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf as="kbd" {...props}>
      {props.children}
    </PlateLeaf>
  )
}

function LinkElement(props: PlateElementProps<TLinkElement>) {
  return (
    <PlateElement
      {...props}
      as="a"
      attributes={{
        ...props.attributes,
        ...getLinkAttributes(props.editor, props.element),
      }}
    >
      {props.children}
    </PlateElement>
  )
}

function CodeBlockElement(props: PlateElementProps) {
  return (
    <PlateElement as="pre" className="editor-ui-code-block" {...props}>
      <code>{props.children}</code>
    </PlateElement>
  )
}

function CodeLineElement(props: PlateElementProps) {
  return (
    <PlateElement as="div" className="editor-ui-code-line" {...props}>
      {props.children}
    </PlateElement>
  )
}

function CodeSyntaxLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf as="span" {...props}>
      {props.children}
    </PlateLeaf>
  )
}

function TableElement(props: PlateElementProps) {
  return (
    <TableProvider>
      <TableElementContent {...props} />
    </TableProvider>
  )
}

function TableElementContent(props: PlateElementProps) {
  const readOnly = useReadOnly()
  const { marginLeft, props: tableProps } = useTableElement()

  return (
    <PlateElement
      {...props}
      className="editor-ui-table-block"
      style={{ paddingLeft: marginLeft }}
    >
      {readOnly ? null : <TableControls />}
      <div className="editor-ui-table-wrap">
        <table className="editor-ui-table" {...tableProps}>
          <tbody>{props.children}</tbody>
        </table>
      </div>
    </PlateElement>
  )
}

function TableRowElement(props: PlateElementProps) {
  return (
    <PlateElement as="tr" {...props}>
      {props.children}
    </PlateElement>
  )
}

function TableCellElement(props: PlateElementProps) {
  const { api } = useEditorPlugin(TablePlugin)

  return (
    <PlateElement
      as="td"
      className="editor-ui-table-cell"
      {...props}
      attributes={{
        ...props.attributes,
        colSpan: api.table.getColSpan(props.element),
        rowSpan: api.table.getRowSpan(props.element),
      }}
    >
      {props.children}
    </PlateElement>
  )
}

function TableHeaderCellElement(props: PlateElementProps) {
  const { api } = useEditorPlugin(TablePlugin)

  return (
    <PlateElement
      as="th"
      className="editor-ui-table-cell"
      {...props}
      attributes={{
        ...props.attributes,
        colSpan: api.table.getColSpan(props.element),
        rowSpan: api.table.getRowSpan(props.element),
      }}
    >
      {props.children}
    </PlateElement>
  )
}

function TableControls() {
  const labels = useEditorLabels()

  const { editor, tf } = useEditorPlugin(TablePlugin)
  const { canMerge, canSplit } = useTableMergeState()

  const runAction = (action: () => void) => {
    action()
    editor.tf.focus()
  }

  return (
    <div
      className="editor-ui-table-toolbar"
      contentEditable={false}
      suppressContentEditableWarning
    >
      <button
        aria-label={labels.insertRowAbove}
        className="editor-ui-table-toolbar__button"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runAction(() => tf.insert.tableRow({ before: true }))}
      >
        <ArrowUp />
      </button>
      <button
        aria-label={labels.insertRowBelow}
        className="editor-ui-table-toolbar__button"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runAction(() => tf.insert.tableRow())}
      >
        <ArrowDown />
      </button>
      <button
        aria-label={labels.deleteRow}
        className="editor-ui-table-toolbar__button"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runAction(() => tf.remove.tableRow())}
      >
        <X />
      </button>
      <span className="editor-ui-table-toolbar__separator" />
      <button
        aria-label={labels.insertColumnLeft}
        className="editor-ui-table-toolbar__button"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runAction(() => tf.insert.tableColumn({ before: true }))}
      >
        <ArrowLeft />
      </button>
      <button
        aria-label={labels.insertColumnRight}
        className="editor-ui-table-toolbar__button"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runAction(() => tf.insert.tableColumn())}
      >
        <ArrowRight />
      </button>
      <button
        aria-label={labels.deleteColumn}
        className="editor-ui-table-toolbar__button"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runAction(() => tf.remove.tableColumn())}
      >
        <X />
      </button>
      <span className="editor-ui-table-toolbar__separator" />
      <button
        aria-label={labels.mergeCells}
        className="editor-ui-table-toolbar__button"
        disabled={!canMerge}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runAction(() => tf.table.merge())}
      >
        <Combine />
      </button>
      <button
        aria-label={labels.splitCell}
        className="editor-ui-table-toolbar__button"
        disabled={!canSplit}
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runAction(() => tf.table.split())}
      >
        <Ungroup />
      </button>
      <span className="editor-ui-table-toolbar__separator" />
      <button
        aria-label={labels.deleteTable}
        className="editor-ui-table-toolbar__button"
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => runAction(() => tf.remove.table())}
      >
        <Trash2 />
      </button>
    </div>
  )
}

function ImageElement(props: PlateElementProps) {
  const labels = useEditorLabels()
  const url = readElementString(props.element, "url")

  return (
    <PlateElement as="figure" className="editor-ui-media" {...props}>
      <div className="editor-ui-media__frame" contentEditable={false}>
        {url ? (
          <img alt="" className="editor-ui-media__image" src={url} />
        ) : (
          <span className="editor-ui-media__label">{labels.image}</span>
        )}
      </div>
      {props.children}
    </PlateElement>
  )
}

function FileElement(props: PlateElementProps) {
  const labels = useEditorLabels()
  const name = readElementString(props.element, "name") || labels.file
  const url = readElementString(props.element, "url")

  return (
    <PlateElement as="figure" className="editor-ui-media" {...props}>
      <div className="editor-ui-media__file" contentEditable={false}>
        {url ? (
          <a href={url} rel="noreferrer" target="_blank">
            {name}
          </a>
        ) : (
          <span>{name}</span>
        )}
      </div>
      {props.children}
    </PlateElement>
  )
}

function MediaEmbedElement(props: PlateElementProps) {
  const labels = useEditorLabels()

  const url = readElementString(props.element, "url")

  return (
    <PlateElement as="figure" className="editor-ui-media" {...props}>
      <div className="editor-ui-media__embed" contentEditable={false}>
        {url || labels.media}
      </div>
      {props.children}
    </PlateElement>
  )
}

function PlaceholderElement(props: PlateElementProps) {
  const labels = useEditorLabels()

  const mediaType =
    readElementString(props.element, "mediaType") || labels.media

  return (
    <PlateElement as="figure" className="editor-ui-media" {...props}>
      <div className="editor-ui-media__placeholder" contentEditable={false}>
        {mediaType}
      </div>
      {props.children}
    </PlateElement>
  )
}

function createCodeBlockKit() {
  return [
    CodeBlockPlugin.configure({
      node: { component: CodeBlockElement },
      options: { lowlight: null },
    }),
    CodeLinePlugin.withComponent(CodeLineElement),
    CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
  ]
}

function createTableKit() {
  return [
    TablePlugin.withComponent(TableElement),
    TableRowPlugin.withComponent(TableRowElement),
    TableCellPlugin.withComponent(TableCellElement),
    TableCellHeaderPlugin.withComponent(TableHeaderCellElement),
  ]
}

function createMediaKit() {
  return [
    ImagePlugin.withComponent(ImageElement),
    FilePlugin.withComponent(FileElement),
    MediaEmbedPlugin.withComponent(MediaEmbedElement),
    PlaceholderPlugin.withComponent(PlaceholderElement),
  ]
}

function createAutoformatRules(): AutoformatRule[] {
  const markRules: AutoformatRule[] = [
    { match: "***", mode: "mark", type: [KEYS.bold, KEYS.italic] },
    { match: "**", mode: "mark", type: KEYS.bold },
    { match: "__", mode: "mark", type: KEYS.underline },
    { match: "*", mode: "mark", type: KEYS.italic },
    { match: "_", mode: "mark", type: KEYS.italic },
    { match: "~~", mode: "mark", type: KEYS.strikethrough },
    { match: "`", mode: "mark", type: KEYS.code },
    { match: "==", mode: "mark", type: KEYS.highlight },
  ]

  const blockRules: AutoformatRule[] = [
    { match: "# ", mode: "block", type: KEYS.h1 },
    { match: "## ", mode: "block", type: KEYS.h2 },
    { match: "### ", mode: "block", type: KEYS.h3 },
    { match: "#### ", mode: "block", type: KEYS.h4 },
    { match: "##### ", mode: "block", type: KEYS.h5 },
    { match: "###### ", mode: "block", type: KEYS.h6 },
    { match: "> ", mode: "block", type: KEYS.blockquote },
    {
      format: (editor) => {
        editor.tf.setNodes({ type: KEYS.hr })
        editor.tf.insertNodes({
          children: [{ text: "" }],
          type: KEYS.p,
        })
      },
      match: ["---", "___ "],
      mode: "block",
      type: KEYS.hr,
    },
    {
      format: (editor) => {
        toggleList(editor, { listStyleType: KEYS.ul })
      },
      match: ["* ", "- "],
      mode: "block",
      type: "list",
    },
    {
      format: (editor) => {
        toggleList(editor, { listStyleType: KEYS.ol })
      },
      match: [String.raw`^\d+\.$ `, String.raw`^\d+\)$ `],
      matchByRegex: true,
      mode: "block",
      type: "list",
    },
  ]

  return [
    ...blockRules,
    ...markRules,
    ...autoformatSmartQuotes,
    ...autoformatPunctuation,
    ...autoformatLegal,
    ...autoformatLegalHtml,
    ...autoformatArrow,
    ...autoformatMath,
  ].map((rule) => ({
    ...rule,
    query: (editor) =>
      !editor.api.some({
        match: { type: editor.getType(KEYS.codeBlock) },
      }),
  }))
}

function resolveFeatureMap(
  preset: EditorPreset,
  overrides: Partial<Record<EditorFeature, boolean>> | undefined
): Record<EditorFeature, boolean> {
  const defaults = presetFeatureDefaults[preset]

  return {
    ...defaults,
    ...overrides,
  }
}

function createFeatureDefaults(
  overrides: Partial<Record<EditorFeature, boolean>> = {}
): Record<EditorFeature, boolean> {
  return {
    autoformat: true,
    basicBlocks: true,
    blockSelection: true,
    codeBlocks: true,
    dragAndDrop: true,
    html: true,
    links: true,
    lists: true,
    markdown: true,
    marks: true,
    media: true,
    richBlocks: true,
    slash: true,
    tables: true,
    toolbars: true,
    ...overrides,
  }
}

function isPluginKey(key: string, keys: string[]) {
  return keys.includes(key)
}

function readElementString(element: PlateElementProps["element"], key: string) {
  const value = (element as Record<string, unknown>)[key]

  return typeof value === "string" ? value : ""
}
