import * as React from "react"

import type { EditorCommand } from "../types/editor"

export const EditorCommandsContext = React.createContext<
  EditorCommand[] | null
>(null)

export function useEditorCommands(fallbackCommands: EditorCommand[]) {
  return React.useContext(EditorCommandsContext) ?? fallbackCommands
}
