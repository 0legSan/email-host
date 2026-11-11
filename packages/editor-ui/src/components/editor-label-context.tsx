import { createContext, useContext } from "react"
import { defaultEditorLabels } from "./editor-labels"

// Labels update independently of the Plate editor instance and document.
export const EditorLabelsContext = createContext(defaultEditorLabels)

export function useEditorLabels() {
  return useContext(EditorLabelsContext)
}
