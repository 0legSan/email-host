import * as React from "react"

import { RichTextEditor } from "./rich-text-editor"

export const BlockEditor = RichTextEditor

export function EditorContainer({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["editor-ui editor-ui-editor-container", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}

export function EditorCanvas({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["editor-ui-editor-canvas", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}

export function FixedToolbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["editor-ui-editor__toolbar", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}

export function FloatingToolbar({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["editor-ui-floating-toolbar", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}
