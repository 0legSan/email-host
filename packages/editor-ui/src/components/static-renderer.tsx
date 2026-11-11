import * as React from "react"
import type { RichTextEditorLabels } from "./editor-labels"
import type { Value } from "platejs"

import { serializeEditorValueToHtml } from "../lib/html"

export type EditorStaticRendererProps = {
  className?: string
  labels?: Pick<RichTextEditorLabels, "file">
  value: Value
}

export function EditorStaticRenderer({
  className,
  value,
  labels,
}: EditorStaticRendererProps) {
  const html = React.useMemo(
    () => serializeEditorValueToHtml(value, [], labels),
    [value, labels]
  )

  return (
    <div
      className={["editor-ui editor-ui-static", className]
        .filter(Boolean)
        .join(" ")}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
