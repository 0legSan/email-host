import type {
  EditorCommand,
  EditorFeature,
  EditorLabels,
  EditorPreset,
} from "../types/editor"
import { ListStyleType } from "@platejs/list"
import { KEYS } from "platejs"

import { insertBlock, type EditorInstance } from "../transforms"

export type DefaultEditorCommandFactoryContext = {
  features?: Partial<Record<EditorFeature, boolean>>
  labels?: Partial<DefaultEditorCommandLabels>
  preset?: EditorPreset
}

export type DefaultEditorCommandLabels = Pick<
  EditorLabels,
  | "bulletedList"
  | "divider"
  | "heading"
  | "numberedList"
  | "paragraph"
  | "quote"
  | "subheading"
> & {
  bulletedListDescription: string
  codeBlock: string
  codeBlockDescription: string
  dividerDescription: string
  file: string
  fileDescription: string
  headingDescription: string
  h1: string
  h1Description: string
  h4: string
  h4Description: string
  h5: string
  h5Description: string
  h6: string
  h6Description: string
  image: string
  imageDescription: string
  mediaEmbed: string
  mediaEmbedDescription: string
  numberedListDescription: string
  paragraphDescription: string
  quoteDescription: string
  subheadingDescription: string
  table: string
  tableDescription: string
}

export const defaultEditorCommandLabels: DefaultEditorCommandLabels = {
  bulletedList: "Маркированный список",
  bulletedListDescription: "Список с пунктами",
  codeBlock: "Блок кода",
  codeBlockDescription: "Фрагмент кода с моноширинным текстом",
  divider: "Разделитель",
  dividerDescription: "Горизонтальная линия",
  file: "Файл",
  fileDescription: "Плейсхолдер вложения",
  h1: "Заголовок 1",
  h1Description: "Главный заголовок",
  h4: "Заголовок 4",
  h4Description: "Небольшой заголовок",
  h5: "Заголовок 5",
  h5Description: "Малый заголовок",
  h6: "Заголовок 6",
  h6Description: "Подпись или служебный заголовок",
  heading: "Заголовок 2",
  headingDescription: "Крупный заголовок секции",
  image: "Изображение",
  imageDescription: "Плейсхолдер изображения",
  mediaEmbed: "Встраивание",
  mediaEmbedDescription: "Ссылка или embed-блок",
  numberedList: "Нумерованный список",
  numberedListDescription: "Список с шагами",
  paragraph: "Текст",
  paragraphDescription: "Обычный абзац",
  quote: "Цитата",
  quoteDescription: "Выделенная цитата",
  subheading: "Заголовок 3",
  subheadingDescription: "Средний заголовок",
  table: "Таблица",
  tableDescription: "Простая таблица",
}

export function createDefaultEditorCommands({
  features,
  labels: labelOverrides,
  preset = "email",
}: DefaultEditorCommandFactoryContext): EditorCommand[] {
  const labels = {
    ...defaultEditorCommandLabels,
    ...labelOverrides,
  }

  const commands: EditorCommand[] = [
    {
      blockType: KEYS.p,
      description: labels.paragraphDescription,
      group: "basic",
      icon: "T",
      id: "paragraph",
      kind: "block",
      keywords: ["text", "paragraph", "p", "текст", "абзац"],
      label: labels.paragraph,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.p, { upsert: true }),
    },
    {
      blockType: KEYS.h1,
      description: labels.h1Description,
      group: "basic",
      icon: "H1",
      id: "h1",
      kind: "block",
      keywords: ["heading", "h1", "title", "заголовок"],
      label: labels.h1,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.h1, { upsert: true }),
    },
    {
      blockType: KEYS.h2,
      description: labels.headingDescription,
      group: "basic",
      icon: "H2",
      id: "heading",
      kind: "block",
      keywords: ["heading", "h2", "title", "заголовок"],
      label: labels.heading,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.h2, { upsert: true }),
    },
    {
      blockType: KEYS.h3,
      description: labels.subheadingDescription,
      group: "basic",
      icon: "H3",
      id: "subheading",
      kind: "block",
      keywords: ["subheading", "h3", "subtitle", "подзаголовок"],
      label: labels.subheading,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.h3, { upsert: true }),
    },
    {
      blockType: KEYS.h4,
      description: labels.h4Description,
      group: "basic",
      icon: "H4",
      id: "h4",
      kind: "block",
      keywords: ["heading", "h4", "small heading", "заголовок"],
      label: labels.h4,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.h4, { upsert: true }),
    },
    {
      blockType: KEYS.h5,
      description: labels.h5Description,
      group: "basic",
      icon: "H5",
      id: "h5",
      kind: "block",
      keywords: ["heading", "h5", "caption", "заголовок"],
      label: labels.h5,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.h5, { upsert: true }),
    },
    {
      blockType: KEYS.h6,
      description: labels.h6Description,
      group: "basic",
      icon: "H6",
      id: "h6",
      kind: "block",
      keywords: ["heading", "h6", "caption", "заголовок"],
      label: labels.h6,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.h6, { upsert: true }),
    },
    {
      blockType: KEYS.ul,
      description: labels.bulletedListDescription,
      group: "basic",
      icon: "•",
      id: "bulleted-list",
      kind: "block",
      keywords: ["unordered", "bullet", "ul", "list", "список"],
      label: labels.bulletedList,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.ul, { upsert: true }),
    },
    {
      blockType: KEYS.ol,
      description: labels.numberedListDescription,
      group: "basic",
      icon: "1.",
      id: "numbered-list",
      kind: "block",
      keywords: ["ordered", "number", "ol", "list", "список"],
      label: labels.numberedList,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.ol, { upsert: true }),
    },
    {
      blockType: KEYS.blockquote,
      description: labels.quoteDescription,
      group: "basic",
      icon: "❝",
      id: "quote",
      kind: "block",
      keywords: ["blockquote", "quote", "цитата"],
      label: labels.quote,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.blockquote, {
          upsert: true,
        }),
    },
    {
      blockType: KEYS.hr,
      description: labels.dividerDescription,
      group: "basic",
      icon: "—",
      id: "divider",
      kind: "block",
      keywords: ["hr", "divider", "separator", "line", "разделитель"],
      label: labels.divider,
      run: ({ editor }) => insertBlock(editor as EditorInstance, KEYS.hr),
    },
    {
      blockType: KEYS.table,
      description: labels.tableDescription,
      feature: "tables",
      group: "rich",
      icon: "▦",
      id: "table",
      kind: "block",
      keywords: ["table", "grid", "rows", "columns", "таблица"],
      label: labels.table,
      run: ({ editor }) => insertBlock(editor as EditorInstance, KEYS.table),
    },
    {
      blockType: KEYS.codeBlock,
      description: labels.codeBlockDescription,
      feature: "codeBlocks",
      group: "rich",
      icon: "</>",
      id: "code-block",
      kind: "block",
      keywords: ["code", "pre", "snippet", "код"],
      label: labels.codeBlock,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.codeBlock, { upsert: true }),
    },
    {
      blockType: KEYS.img,
      description: labels.imageDescription,
      feature: "media",
      group: "media",
      icon: "▧",
      id: "image",
      kind: "block",
      keywords: ["image", "picture", "photo", "media", "изображение"],
      label: labels.image,
      run: ({ editor }) => insertBlock(editor as EditorInstance, KEYS.img),
    },
    {
      blockType: KEYS.file,
      description: labels.fileDescription,
      feature: "media",
      group: "media",
      icon: "□",
      id: "file",
      kind: "block",
      keywords: ["file", "attachment", "document", "файл", "вложение"],
      label: labels.file,
      run: ({ editor }) => insertBlock(editor as EditorInstance, KEYS.file),
    },
    {
      blockType: KEYS.mediaEmbed,
      description: labels.mediaEmbedDescription,
      feature: "media",
      group: "media",
      icon: "◫",
      id: "media-embed",
      kind: "block",
      keywords: ["embed", "media", "url", "video", "видео", "ссылка"],
      label: labels.mediaEmbed,
      run: ({ editor }) =>
        insertBlock(editor as EditorInstance, KEYS.mediaEmbed),
    },
  ]

  return commands.filter((command) =>
    isCommandAvailable(command, preset, features)
  )
}

export function getListCommandId(type: string) {
  if (type === KEYS.ol || type === ListStyleType.Decimal) {
    return "numbered-list"
  }

  if (type === KEYS.ul || type === ListStyleType.Disc) {
    return "bulleted-list"
  }

  return null
}

function isCommandAvailable(
  command: EditorCommand,
  preset: EditorPreset,
  features: Partial<Record<EditorFeature, boolean>> | undefined
) {
  if (command.presets && !command.presets.includes(preset)) {
    return false
  }

  if (command.feature && features?.[command.feature] === false) {
    return false
  }

  return true
}
