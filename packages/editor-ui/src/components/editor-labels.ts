export type RichTextEditorLabels = {
  h1?: string
  h1Description?: string
  h4?: string
  h4Description?: string
  h5?: string
  h5Description?: string
  h6?: string
  h6Description?: string
  placeholder?: string

  addBlock?: string
  blockType?: string
  paragraph?: string
  paragraphDescription?: string
  heading?: string
  headingDescription?: string
  subheading?: string
  subheadingDescription?: string
  quote?: string
  quoteDescription?: string
  bold?: string
  italic?: string
  underline?: string
  strikethrough?: string
  code?: string
  codeBlock?: string
  codeBlockDescription?: string
  bulletedList?: string
  bulletedListDescription?: string
  numberedList?: string
  numberedListDescription?: string
  table?: string
  tableDescription?: string
  image?: string
  imageDescription?: string
  file?: string
  fileDescription?: string
  mediaEmbed?: string
  mediaEmbedDescription?: string
  link?: string
  divider?: string
  dividerDescription?: string
  undo?: string
  redo?: string
  linkPrompt?: string
  linkTrackClicks?: string
  slashCommand?: string
  slashEmpty?: string
  cancel?: string
  invalidLink?: string
  insertLink?: string
  close?: string
  blockActions?: string
  moveUp?: string
  moveDown?: string
  duplicate?: string
  delete?: string
  emptyBlock?: string
  basicBlocks?: string
  richBlocks?: string
  media?: string
  insertRowAbove?: string
  insertRowBelow?: string
  deleteRow?: string
  insertColumnLeft?: string
  insertColumnRight?: string
  deleteColumn?: string
  mergeCells?: string
  splitCell?: string
  deleteTable?: string
}

export const defaultEditorLabels: Required<RichTextEditorLabels> = {
  h1: "Заголовок 1",
  h1Description: "Главный заголовок",
  h4: "Заголовок 4",
  h4Description: "Небольшой заголовок",
  h5: "Заголовок 5",
  h5Description: "Малый заголовок",
  h6: "Заголовок 6",
  h6Description: "Подпись или служебный заголовок",
  placeholder: "Начните писать или нажмите / для блоков...",

  addBlock: "Добавить блок",
  blockType: "Тип блока",
  bold: "Жирный",
  bulletedList: "Маркированный список",
  bulletedListDescription: "Список с пунктами",
  code: "Код",
  codeBlock: "Блок кода",
  codeBlockDescription: "Фрагмент кода с моноширинным текстом",
  divider: "Вставить разделитель",
  dividerDescription: "Горизонтальная линия",
  file: "Файл",
  fileDescription: "Плейсхолдер вложения",
  heading: "Заголовок 2",
  headingDescription: "Крупный заголовок секции",
  italic: "Курсив",
  image: "Изображение",
  imageDescription: "Плейсхолдер изображения",
  link: "Добавить ссылку",
  linkPrompt: "URL ссылки",
  linkTrackClicks: "Отслеживать клики по этой ссылке?",
  mediaEmbed: "Встраивание",
  mediaEmbedDescription: "Ссылка или embed-блок",
  numberedList: "Нумерованный список",
  numberedListDescription: "Список с шагами",
  paragraph: "Текст",
  paragraphDescription: "Обычный абзац",
  quote: "Цитата",
  quoteDescription: "Выделенная цитата",
  redo: "Повторить",
  slashCommand: "Блоки",
  slashEmpty: "Ничего не найдено",
  strikethrough: "Зачеркнуть",
  subheading: "Заголовок 3",
  subheadingDescription: "Средний заголовок",
  table: "Таблица",
  tableDescription: "Простая таблица",
  underline: "Подчеркнуть",
  undo: "Отменить",
  cancel: "Отмена",
  invalidLink:
    "Не удалось вставить ссылку. Укажите полный URL, например https://example.com.",
  insertLink: "Вставить ссылку",
  close: "Закрыть",
  blockActions: "Действия блока",
  moveUp: "Переместить вверх",
  moveDown: "Переместить вниз",
  duplicate: "Дублировать",
  delete: "Удалить",
  emptyBlock: "Пустой блок",
  basicBlocks: "Базовые блоки",
  richBlocks: "Расширенные блоки",
  media: "Медиа",
  insertRowAbove: "Вставить строку выше",
  insertRowBelow: "Вставить строку ниже",
  deleteRow: "Удалить строку",
  insertColumnLeft: "Вставить столбец слева",
  insertColumnRight: "Вставить столбец справа",
  deleteColumn: "Удалить столбец",
  mergeCells: "Объединить ячейки",
  splitCell: "Разделить ячейку",
  deleteTable: "Удалить таблицу",
}
