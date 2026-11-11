import { createDefaultEditorCommands } from "@workspace/editor-ui"
import { mailText } from "@workspace/mail-design/locale"

export function getMailEditorLabels() {
  return {
    placeholder: mailText(
      "Начните писать или нажмите / для блоков...",
      "Start writing or type / for blocks..."
    ),
    cancel: mailText("Отмена", "Cancel"),
    invalidLink: mailText(
      "Не удалось вставить ссылку. Укажите полный URL, например https://example.com.",
      "Could not insert the link. Enter a full URL, such as https://example.com."
    ),
    insertLink: mailText("Вставить ссылку", "Insert link"),
    close: mailText("Закрыть", "Close"),
    blockActions: mailText("Действия блока", "Block actions"),
    moveUp: mailText("Переместить вверх", "Move up"),
    moveDown: mailText("Переместить вниз", "Move down"),
    duplicate: mailText("Дублировать", "Duplicate"),
    delete: mailText("Удалить", "Delete"),
    emptyBlock: mailText("Пустой блок", "Empty block"),
    basicBlocks: mailText("Базовые блоки", "Basic blocks"),
    richBlocks: mailText("Расширенные блоки", "Rich blocks"),
    media: mailText("Медиа", "Media"),
    insertRowAbove: mailText("Вставить строку выше", "Insert row above"),
    insertRowBelow: mailText("Вставить строку ниже", "Insert row below"),
    deleteRow: mailText("Удалить строку", "Delete row"),
    insertColumnLeft: mailText("Вставить столбец слева", "Insert column left"),
    insertColumnRight: mailText(
      "Вставить столбец справа",
      "Insert column right"
    ),
    deleteColumn: mailText("Удалить столбец", "Delete column"),
    mergeCells: mailText("Объединить ячейки", "Merge cells"),
    splitCell: mailText("Разделить ячейку", "Split cell"),
    deleteTable: mailText("Удалить таблицу", "Delete table"),

    addBlock: mailText("Добавить блок", "Add block"),
    blockType: mailText("Тип блока", "Block type"),
    bold: mailText("Жирный", "Bold"),
    bulletedList: mailText("Маркированный список", "Bulleted list"),
    bulletedListDescription: mailText(
      "Список с пунктами",
      "List with bullet points"
    ),
    code: mailText("Код", "Code"),
    codeBlock: mailText("Блок кода", "Code block"),
    codeBlockDescription: mailText(
      "Фрагмент кода с моноширинным текстом",
      "Code in monospaced text"
    ),
    divider: mailText("Разделитель", "Divider"),
    dividerDescription: mailText("Горизонтальная линия", "Horizontal line"),
    file: mailText("Файл", "File"),
    fileDescription: mailText("Плейсхолдер вложения", "Attachment placeholder"),
    heading: mailText("Заголовок 2", "Heading 2"),
    headingDescription: mailText(
      "Крупный заголовок секции",
      "Large section heading"
    ),
    italic: mailText("Курсив", "Italic"),
    image: mailText("Изображение", "Image"),
    imageDescription: mailText("Плейсхолдер изображения", "Image placeholder"),
    link: mailText("Добавить ссылку", "Add link"),
    linkPrompt: mailText("URL ссылки", "Link URL"),
    linkTrackClicks: mailText(
      "Отслеживать клики по этой ссылке?",
      "Track clicks on this link?"
    ),
    mediaEmbed: mailText("Встраивание", "Embed"),
    mediaEmbedDescription: mailText(
      "Ссылка или embed-блок",
      "Link or embedded block"
    ),
    numberedList: mailText("Нумерованный список", "Numbered list"),
    numberedListDescription: mailText("Список с шагами", "List of steps"),
    paragraph: mailText("Текст", "Text"),
    paragraphDescription: mailText("Обычный абзац", "Plain paragraph"),
    quote: mailText("Цитата", "Quote"),
    quoteDescription: mailText("Выделенная цитата", "Highlighted quotation"),
    redo: mailText("Повторить", "Redo"),
    slashCommand: mailText("Блоки", "Blocks"),
    slashEmpty: mailText("Ничего не найдено", "No results"),
    strikethrough: mailText("Зачеркнуть", "Strikethrough"),
    subheading: mailText("Заголовок 3", "Heading 3"),
    subheadingDescription: mailText("Средний заголовок", "Medium heading"),
    table: mailText("Таблица", "Table"),
    tableDescription: mailText("Простая таблица", "Simple table"),
    underline: mailText("Подчеркнуть", "Underline"),
    undo: mailText("Отменить", "Undo"),
    h1: mailText("Заголовок 1", "Heading 1"),
    h1Description: mailText("Главный заголовок", "Main heading"),
    h4: mailText("Заголовок 4", "Heading 4"),
    h4Description: mailText("Небольшой заголовок", "Small heading"),
    h5: mailText("Заголовок 5", "Heading 5"),
    h5Description: mailText("Малый заголовок", "Minor heading"),
    h6: mailText("Заголовок 6", "Heading 6"),
    h6Description: mailText(
      "Подпись или служебный заголовок",
      "Caption or utility heading"
    ),
    fixedToolbar: mailText("Панель редактора", "Editor toolbar"),
    floatingToolbar: mailText("Панель выделения", "Selection toolbar"),
    insert: mailText("Вставить", "Insert"),
    turnInto: mailText("Преобразовать", "Turn into"),
  }
}

export function getMailEditorCommands() {
  return createDefaultEditorCommands({
    preset: "email",
    labels: getMailEditorLabels(),
  })
}
