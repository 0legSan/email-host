import { defaultEditorLabels, type RichTextEditorLabels } from "./editor-labels"
import { useEditorLabels } from "./editor-label-context"
import * as React from "react"
import { DndPlugin, useDraggable, useDropLine } from "@platejs/dnd"
import { expandListItemsWithChildren } from "@platejs/list"
import { BlockSelectionPlugin } from "@platejs/selection/react"
import {
  ArrowDown,
  ArrowUp,
  Copy,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react"
import { KEYS, PathApi, type TElement } from "platejs"
import {
  type PlateElementProps,
  type RenderNodeWrapper,
  useEditorRef,
} from "platejs/react"

import { createDefaultEditorCommands, getListCommandId } from "../commands"
import {
  duplicateBlock,
  getBlockType,
  moveBlock,
  removeBlock,
  setBlockType,
  type EditorInstance,
} from "../lib/editor-transforms"

const undraggableTypes = new Set<string>([
  KEYS.tr,
  KEYS.td,
  "th",
  "column",
  "mail-signature",
])
const turnIntoTypes = new Set<string>([
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
])

export const BlockDraggable: RenderNodeWrapper = ({
  editor,
  element,
  path,
}) => {
  if (isEmptyParagraphAfterMailSignature(editor, element, path)) {
    return (props) => (
      <div
        aria-hidden="true"
        className="editor-ui-block-wrapper editor-ui-block-wrapper--hidden"
        contentEditable={false}
      >
        {props.children}
      </div>
    )
  }

  if (
    editor.dom.readOnly ||
    path.length !== 1 ||
    undraggableTypes.has(element.type)
  ) {
    return
  }

  // A new wrapper component here remounts block menus on every editor update.
  return DraggableBlock
}

function isEmptyParagraphAfterMailSignature(
  editor: { children?: unknown[] },
  element: TElement,
  path: number[]
) {
  if (path.length !== 1 || path[0] <= 0 || element.type !== KEYS.p) {
    return false
  }

  const previous = editor.children?.[path[0] - 1] as TElement | undefined

  return previous?.type === "mail-signature" && isEmptyParagraph(element)
}

function isEmptyParagraph(element: TElement) {
  const children = element.children as Array<{ text?: unknown }> | undefined

  return children?.length === 1 && children[0]?.text === ""
}

function DraggableBlock(props: PlateElementProps) {
  const labels = useEditorLabels()

  const { children, editor, element } = props
  const { isDragging, nodeRef, previewRef, handleRef } = useDraggable({
    element,
    onDropHandler: (_, { dragItem }) => {
      const id = (dragItem as { id?: string[] | string }).id

      if (id) {
        editor.getApi(BlockSelectionPlugin).blockSelection.add(id)
      }

      resetPreview(previewRef)
    },
  })
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [menuPlacement, setMenuPlacement] = React.useState<"top" | "bottom">(
    "top"
  )
  const mouseDownPositionRef = React.useRef<{ x: number; y: number } | null>(
    null
  )
  const didDragRef = React.useRef(false)
  const gutterTop = getGutterTop(element)

  React.useEffect(() => {
    if (!isDragging) {
      resetPreview(previewRef)
    }
  }, [isDragging, previewRef])

  React.useEffect(() => {
    const cleanupPreview = () => {
      window.setTimeout(() => resetPreview(previewRef), 0)
    }

    document.addEventListener("mouseup", cleanupPreview, true)
    document.addEventListener("dragend", cleanupPreview, true)
    document.addEventListener("drop", cleanupPreview, true)

    return () => {
      document.removeEventListener("mouseup", cleanupPreview, true)
      document.removeEventListener("dragend", cleanupPreview, true)
      document.removeEventListener("drop", cleanupPreview, true)
    }
  }, [previewRef])

  const updateMenuPlacement = React.useCallback((target: Element | null) => {
    const block = target?.closest(".editor-ui-block-wrapper")

    if (!block) {
      setMenuPlacement("top")
      return
    }

    const rect = block.getBoundingClientRect()
    let visibleTop = 0
    let visibleBottom =
      window.innerHeight || document.documentElement.clientHeight
    // A compose window scrolls inside its own panel. Menus must fit that panel,
    // otherwise the first block's menu is clipped above the editor.
    for (
      let parent = block.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      if (
        /(auto|scroll|hidden|clip)/.test(
          window.getComputedStyle(parent).overflowY
        )
      ) {
        const bounds = parent.getBoundingClientRect()
        visibleTop = Math.max(visibleTop, bounds.top)
        visibleBottom = Math.min(visibleBottom, bounds.bottom)
      }
    }
    const topSpace = rect.top - visibleTop
    const bottomSpace = visibleBottom - rect.bottom

    setMenuPlacement(
      topSpace >= 220 || topSpace >= bottomSpace ? "top" : "bottom"
    )
  }, [])

  return (
    <div
      className={[
        "editor-ui-block-wrapper",
        isDragging ? "editor-ui-block-wrapper--dragging" : "",
        menuOpen ? "editor-ui-block-wrapper--menu-open" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-editor-ui-block-type={element.type}
      ref={nodeRef}
      style={
        {
          "--editor-ui-block-gutter-top": `${gutterTop}px`,
        } as React.CSSProperties
      }
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        updateMenuPlacement(event.currentTarget)
        editor
          .getApi(BlockSelectionPlugin)
          .blockSelection.addOnContextMenu({ element, event })
        setMenuOpen(true)
      }}
    >
      <div className="editor-ui-block-gutter" contentEditable={false}>
        <AddBlockButton element={element} />
        <button
          aria-label={labels.blockActions}
          className="editor-ui-block-handle"
          ref={handleRef}
          type="button"
          data-plate-prevent-deselect
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()

            if (!didDragRef.current && !isDragging) {
              updateMenuPlacement(event.currentTarget)
              setMenuOpen((current) => !current)
            }

            didDragRef.current = false
          }}
          onMouseDown={(event) => {
            mouseDownPositionRef.current = {
              x: event.clientX,
              y: event.clientY,
            }
            didDragRef.current = false
            resetPreview(previewRef)
            prepareDragPreview(
              editor as unknown as EditorInstance,
              element,
              previewRef,
              labels
            )
          }}
          onMouseMove={(event) => {
            if (!mouseDownPositionRef.current) {
              return
            }

            const distanceX = Math.abs(
              event.clientX - mouseDownPositionRef.current.x
            )
            const distanceY = Math.abs(
              event.clientY - mouseDownPositionRef.current.y
            )

            if (distanceX > 5 || distanceY > 5) {
              didDragRef.current = true
              setMenuOpen(false)
            }
          }}
          onMouseUp={() => {
            mouseDownPositionRef.current = null
            window.setTimeout(() => resetPreview(previewRef), 0)
          }}
        >
          <GripVertical
            aria-hidden="true"
            className="editor-ui-block-handle__icon"
          />
        </button>
      </div>
      {menuOpen ? (
        <BlockHandleMenu
          element={element}
          placement={menuPlacement}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}

      <div
        className="editor-ui-block-drag-preview"
        contentEditable={false}
        ref={previewRef}
      />
      <div className="editor-ui-block-content">{children}</div>
      <DropLine />
    </div>
  )
}

function AddBlockButton({ element }: { element: TElement }) {
  const labels = useEditorLabels()

  const editor = useEditorRef()

  return (
    <button
      aria-label={labels.addBlock}
      className="editor-ui-block-add"
      type="button"
      data-plate-prevent-deselect
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()

        const path = editor.api.findPath(element)

        if (!path) {
          return
        }

        editor.tf.insertNodes(
          { type: KEYS.p, children: [{ text: "" }] },
          { at: PathApi.next(path), select: true }
        )

        window.setTimeout(() => {
          editor.tf.focus()
          editor.tf.insertText("/")
        }, 0)
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <Plus aria-hidden="true" className="editor-ui-block-add__icon" />
    </button>
  )
}

function BlockHandleMenu({
  element,
  placement,
  onClose,
}: {
  element: TElement
  placement: "top" | "bottom"
  onClose: () => void
}) {
  const editor = useEditorRef()
  const menuRef = React.useRef<HTMLDivElement | null>(null)
  const [transformOpen, setTransformOpen] = React.useState(false)

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shouldRemoveBlock =
        event.key === "Delete" || event.key === "Backspace"

      if (event.key !== "Escape" && !shouldRemoveBlock) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      if (shouldRemoveBlock) {
        removeBlock(editor as unknown as EditorInstance, element)
      }

      onClose()
      editor.tf.focus()
    }

    document.addEventListener("keydown", handleKeyDown, true)

    return () => document.removeEventListener("keydown", handleKeyDown, true)
  }, [editor, element, onClose])

  React.useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (
        menuRef.current?.contains(target as Node) ||
        (target instanceof Element && target.closest(".editor-ui-block-handle"))
      ) {
        return
      }

      onClose()
    }

    document.addEventListener("pointerdown", handlePointerDown, true)

    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true)
  }, [onClose])

  return (
    <div
      className="editor-ui-block-menu editor-ui-floating-toolbar"
      data-editor-ui-overlay="true"
      data-placement={placement}
      ref={menuRef}
      role="toolbar"
    >
      <BlockMenuButtons
        element={element}
        onActionComplete={onClose}
        transformOpen={transformOpen}
        onTransformOpenChange={setTransformOpen}
      />
    </div>
  )
}

function BlockMenuButtons({
  element,
  onActionComplete,
  transformOpen,
  onTransformOpenChange,
}: {
  element: TElement
  onActionComplete?: () => void
  transformOpen: boolean
  onTransformOpenChange: (open: boolean) => void
}) {
  const labels = useEditorLabels()

  const editor = useEditorRef()
  const transformCommands = useTurnIntoCommands()
  const [activeIndex, setActiveIndex] = React.useState(0)

  const runAction = (action: () => void) => {
    action()
    onTransformOpenChange(false)
    onActionComplete?.()
    window.setTimeout(() => editor.tf.focus(), 0)
  }
  const currentCommand =
    transformCommands.find(
      (command) => command.id === getCommandIdForElement(element)
    ) ?? transformCommands[0]!
  const currentCommandIndex = Math.max(
    0,
    transformCommands.findIndex((command) => command.id === currentCommand.id)
  )

  const openTransformMenu = () => {
    setActiveIndex(currentCommandIndex)
    onTransformOpenChange(true)
  }

  React.useEffect(() => {
    if (!transformOpen) {
      return
    }

    document
      .querySelector<HTMLElement>(
        `[data-editor-ui-block-transform-index="${activeIndex}"]`
      )
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, transformOpen])

  const runCommand = (commandIndex: number) => {
    const command = transformCommands[commandIndex]

    if (!command) {
      return
    }

    runAction(() =>
      setBlockType(
        editor as unknown as EditorInstance,
        command.blockType ?? KEYS.p
      )
    )
  }

  const handleTransformKeyDown = (event: React.KeyboardEvent) => {
    if (!transformOpen) {
      if (
        event.key === "ArrowDown" ||
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault()
        openTransformMenu()
      }

      return
    }

    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % transformCommands.length)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex(
        (index) =>
          (index - 1 + transformCommands.length) % transformCommands.length
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
      setActiveIndex(transformCommands.length - 1)
      return
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      runCommand(activeIndex)
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      onTransformOpenChange(false)
    }
  }

  return (
    <>
      <div
        className="editor-ui-editor__block-menu"
        onKeyDown={handleTransformKeyDown}
      >
        <button
          aria-expanded={transformOpen}
          aria-haspopup="menu"
          aria-label={labels.blockType}
          className="editor-ui-editor__block-button"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            if (transformOpen) {
              onTransformOpenChange(false)
              return
            }

            openTransformMenu()
          }}
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

        {transformOpen ? (
          <div
            className="editor-ui-editor__menu"
            data-editor-ui-overlay="true"
            role="menu"
          >
            {transformCommands.map((command, index) => (
              <button
                aria-selected={index === activeIndex}
                className="editor-ui-editor__menu-item"
                data-editor-ui-block-transform-index={index}
                key={command.id}
                role="menuitem"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  runCommand(index)
                }}
              >
                <span
                  className="editor-ui-editor__menu-icon"
                  aria-hidden="true"
                >
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
        ) : null}
      </div>
      <span className="editor-ui-editor__toolbar-separator" />
      <ToolbarButton
        label={labels.moveUp}
        onClick={() =>
          runAction(() =>
            moveBlock(editor as unknown as EditorInstance, element, "up")
          )
        }
      >
        <ArrowUp />
      </ToolbarButton>
      <ToolbarButton
        label={labels.moveDown}
        onClick={() =>
          runAction(() =>
            moveBlock(editor as unknown as EditorInstance, element, "down")
          )
        }
      >
        <ArrowDown />
      </ToolbarButton>
      <ToolbarButton
        label={labels.duplicate}
        onClick={() =>
          runAction(() =>
            duplicateBlock(editor as unknown as EditorInstance, element)
          )
        }
      >
        <Copy />
      </ToolbarButton>
      <ToolbarButton
        label={labels.delete}
        onClick={() =>
          runAction(() =>
            removeBlock(editor as unknown as EditorInstance, element)
          )
        }
      >
        <Trash2 />
      </ToolbarButton>
    </>
  )
}

function ToolbarButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={label}
      className="editor-ui-editor__button editor-ui-block-menu__button"
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
    >
      {children}
    </button>
  )
}

function getCommandIdForElement(element: TElement) {
  const type = getBlockType(element)
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
}

function useTurnIntoCommands() {
  const labels = useEditorLabels()
  return React.useMemo(
    () =>
      createDefaultEditorCommands({
        labels,
        features: {
          codeBlocks: false,
          media: false,
          tables: false,
        },
        preset: "full",
      }).filter(
        (command) => command.blockType && turnIntoTypes.has(command.blockType)
      ),
    [labels]
  )
}

function DropLine() {
  const { dropLine } = useDropLine()

  if (!dropLine) {
    return null
  }

  return (
    <div
      className={[
        "editor-ui-drop-line",
        `editor-ui-drop-line--${dropLine}`,
      ].join(" ")}
      contentEditable={false}
    />
  )
}

function resetPreview(previewRef: React.RefObject<HTMLDivElement | null>) {
  previewRef.current?.replaceChildren()
  previewRef.current?.classList.add("editor-ui-block-drag-preview--hidden")
}

function prepareDragPreview(
  editor: EditorInstance,
  element: TElement,
  previewRef: React.RefObject<HTMLDivElement | null>,
  labels: Required<RichTextEditorLabels> = defaultEditorLabels
) {
  const preview = previewRef.current

  if (!preview) {
    return
  }

  const selectedEntries =
    editor
      .getApi?.(BlockSelectionPlugin)
      ?.blockSelection.getNodes({ sort: true, collapseTableRows: true }) ?? []
  const entries =
    selectedEntries.length > 0
      ? selectedEntries
      : ([[element, editor.api.findPath?.(element) ?? [0]]] as Array<
          [TElement, number[]]
        >)

  const blocks = expandListItemsWithChildren(
    editor as never,
    entries as never
  ).map(([node]) => node as TElement)

  preview.replaceChildren(
    ...blocks.map((block) => createDragPreviewElement(block, labels))
  )
  preview.classList.remove("editor-ui-block-drag-preview--hidden")
  attachMultiplePreview(editor, previewRef)
}

function createDragPreviewElement(
  block: TElement,
  labels: Required<RichTextEditorLabels>
) {
  const preview = document.createElement("div")
  const text = extractPlainText(block).trim()

  preview.className = "editor-ui-block-drag-preview__item"
  preview.textContent = text || getBlockPreviewLabel(block, labels)

  return preview
}

function extractPlainText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return ""
  }

  if ("text" in node && typeof node.text === "string") {
    return node.text
  }

  if (!("children" in node) || !Array.isArray(node.children)) {
    return ""
  }

  return node.children.map(extractPlainText).join(" ")
}

function getBlockPreviewLabel(
  block: TElement,
  labels: Required<RichTextEditorLabels>
) {
  if (block.type === KEYS.table) {
    return labels.table
  }

  if (block.type === KEYS.img) {
    return labels.image
  }

  if (block.type === KEYS.file) {
    return labels.file
  }

  if (block.type === KEYS.mediaEmbed) {
    return labels.media
  }

  return labels.emptyBlock
}

function getGutterTop(element: TElement) {
  if (
    ([KEYS.table, KEYS.img, KEYS.file, KEYS.mediaEmbed] as string[]).includes(
      element.type
    )
  ) {
    return 0
  }

  if (element.type === KEYS.hr) {
    return 1
  }

  if (element.type === KEYS.codeBlock) {
    return 4
  }

  return 2
}

export function attachMultiplePreview(
  editor: unknown,
  previewRef: React.RefObject<HTMLDivElement | null>
) {
  ;(
    editor as {
      setOption?: (plugin: unknown, key: string, value: unknown) => void
    }
  ).setOption?.(DndPlugin, "multiplePreviewRef", previewRef)
}
