import { BlockSelectionPlugin } from "@platejs/selection/react"
import { KEYS, NodeIdPlugin } from "platejs"

export const BlockSelectionKit = [
  NodeIdPlugin,
  BlockSelectionPlugin.configure({
    options: {
      enableContextMenu: true,
      isSelectable: (element, path) =>
        path.length === 1 &&
        ![KEYS.tr, KEYS.td, "th", "column"].includes(element.type),
    },
  }),
]
