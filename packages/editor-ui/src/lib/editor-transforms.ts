import { ListStyleType } from "@platejs/list"
import { KEYS, PathApi, type NodeEntry, type TElement } from "platejs"
import type { EditorSerializedNode } from "../types/editor"

export type InsertableEditorBlockNode = EditorSerializedNode & {
  children: EditorSerializedNode[]
  type: string
}

export type EditorInstance = {
  api: {
    block: () => NodeEntry<TElement> | undefined
    blocks: (options?: {
      mode?: "all" | "highest" | "lowest"
    }) => Array<NodeEntry<TElement>>
    create: {
      block: (props?: Record<string, unknown>) => TElement
    }
    findPath?: (node: TElement) => number[] | undefined
    isEmpty: (node: TElement) => boolean
    node?: (path: number[]) => NodeEntry<TElement> | undefined
  }
  getApi?: (plugin: unknown) => {
    blockSelection: {
      getNodes: (options?: {
        collapseTableRows?: boolean
        sort?: boolean
      }) => Array<NodeEntry<TElement>>
    }
  }
  tf: {
    focus: () => void
    insertNodes: (nodes: unknown, options?: Record<string, unknown>) => void
    moveNodes?: (options: { at: number[]; to: number[] }) => boolean | void
    removeNodes: (options?: Record<string, unknown>) => void
    setNodes: (
      props: Record<string, unknown>,
      options?: Record<string, unknown>
    ) => void
    unsetNodes: (props: string[], options?: Record<string, unknown>) => void
    withoutNormalizing: (fn: () => void) => void
  }
  deleteBackward?: (unit?: "block" | "character" | "line" | "word") => void
}

export function insertBlock(
  editor: EditorInstance,
  type: string,
  options: { upsert?: boolean } = {}
) {
  const { upsert = false } = options

  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block()

    if (!block) {
      return
    }

    const [currentNode, path] = block
    const currentBlockType = getBlockType(currentNode)
    const sameBlockType = type === currentBlockType

    if (upsert && editor.api.isEmpty(currentNode) && sameBlockType) {
      return
    }

    if (isListType(type)) {
      editor.tf.insertNodes(
        editor.api.create.block({
          indent: 1,
          listStyleType: normalizeListType(type),
        }),
        { select: true }
      )
    } else if (type === KEYS.hr) {
      editor.tf.insertNodes(
        [
          {
            type: KEYS.hr,
            children: [{ text: "" }],
          },
          editor.api.create.block({ type: KEYS.p }),
        ],
        { select: true }
      )
    } else if (isStructuredBlockType(type)) {
      editor.tf.insertNodes(createStructuredBlock(type), {
        at: PathApi.next(path),
        select: true,
      })
    } else {
      editor.tf.insertNodes(editor.api.create.block({ type }), {
        at: PathApi.next(path),
        select: true,
      })
    }

    if (!sameBlockType) {
      editor.tf.removeNodes({ previousEmptyBlock: true })
    }
  })
}

export function insertBlockNode(
  editor: EditorInstance,
  node: InsertableEditorBlockNode
) {
  editor.tf.withoutNormalizing(() => {
    const block = editor.api.block()

    if (!block) {
      return
    }

    const [currentNode, path] = block

    editor.tf.insertNodes(node, {
      at: PathApi.next(path),
      select: true,
    })

    if (editor.api.isEmpty(currentNode)) {
      editor.tf.removeNodes({ at: path })
    }
  })
}

export function setBlockType(editor: EditorInstance, type: string) {
  editor.tf.withoutNormalizing(() => {
    const entries = editor.api.blocks({ mode: "lowest" })

    entries.forEach((entry) => {
      const [node, path] = entry

      if (node.listStyleType) {
        editor.tf.unsetNodes(["listStyleType", "indent"], { at: path })
      }

      if (isListType(type)) {
        editor.tf.setNodes(
          editor.api.create.block({
            indent: 1,
            listStyleType: normalizeListType(type),
          }),
          { at: path }
        )
        return
      }

      if (isStructuredBlockType(type)) {
        editor.tf.insertNodes(createStructuredBlock(type), {
          at: PathApi.next(path),
          select: true,
        })
        editor.tf.removeNodes({ at: path })
        return
      }

      if (node.type !== type) {
        editor.tf.setNodes({ type }, { at: path })
      }
    })
  })
}

export function insertInlineElement(editor: EditorInstance, type: string) {
  void editor
  void type
  return
}

export function duplicateBlock(editor: EditorInstance, element: TElement) {
  const path = editor.api.findPath?.(element)

  if (!path) {
    return
  }

  editor.tf.insertNodes(JSON.parse(JSON.stringify(element)) as TElement, {
    at: PathApi.next(path),
  })
}

export function removeBlock(editor: EditorInstance, element: TElement) {
  const path = editor.api.findPath?.(element)

  if (!path) {
    return
  }

  editor.tf.removeNodes({ at: path })
}

export function moveBlock(
  editor: EditorInstance,
  element: TElement,
  direction: "down" | "up"
) {
  const path = editor.api.findPath?.(element)

  if (!path || !editor.tf.moveNodes) {
    return
  }

  if (direction === "up") {
    if (path[0] <= 0) {
      return
    }

    editor.tf.moveNodes({ at: path, to: [path[0] - 1] })
    return
  }

  editor.tf.moveNodes({ at: path, to: [path[0] + 2] })
}

export function deleteCharactersBackward(
  editor: EditorInstance,
  count: number
) {
  for (let index = 0; index < count; index += 1) {
    editor.deleteBackward?.("character")
  }
}

export function getBlockType(block: TElement) {
  const listStyleType = block.listStyleType

  if (typeof listStyleType === "string") {
    return normalizeListType(listStyleType)
  }

  return block.type
}

function isListType(type: string) {
  return (
    type === KEYS.ol ||
    type === KEYS.ul ||
    type === ListStyleType.Decimal ||
    type === ListStyleType.Disc
  )
}

function normalizeListType(type: string) {
  if (type === KEYS.ol || type === ListStyleType.Decimal) {
    return KEYS.ol
  }

  if (type === KEYS.ul || type === ListStyleType.Disc) {
    return KEYS.ul
  }

  return type
}

function isStructuredBlockType(type: string) {
  return (
    type === KEYS.codeBlock ||
    type === KEYS.table ||
    type === KEYS.img ||
    type === KEYS.file ||
    type === KEYS.mediaEmbed
  )
}

function createStructuredBlock(type: string) {
  if (type === KEYS.codeBlock) {
    return {
      type: KEYS.codeBlock,
      lang: "text",
      children: [
        {
          type: KEYS.codeLine,
          children: [{ text: "" }],
        },
      ],
    }
  }

  if (type === KEYS.table) {
    return {
      type: KEYS.table,
      children: [0, 1].map((rowIndex) => ({
        type: KEYS.tr,
        children: [0, 1].map((cellIndex) => ({
          type: rowIndex === 0 ? KEYS.th : KEYS.td,
          children: [
            {
              type: KEYS.p,
              children: [
                {
                  text: cellIndex === 0 && rowIndex === 0 ? "" : "",
                },
              ],
            },
          ],
        })),
      })),
    }
  }

  if (type === KEYS.file) {
    return {
      type: KEYS.file,
      name: "",
      children: [{ text: "" }],
    }
  }

  if (type === KEYS.mediaEmbed) {
    return {
      type: KEYS.mediaEmbed,
      url: "",
      children: [{ text: "" }],
    }
  }

  return {
    type: KEYS.img,
    url: "",
    children: [{ text: "" }],
  }
}
