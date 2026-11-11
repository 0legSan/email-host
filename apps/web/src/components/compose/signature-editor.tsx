import * as React from "react"
import {
  RichTextEditor,
  type RichTextEditorProps,
  type RichTextEditorRef,
} from "@workspace/editor-ui"

const signatureFeatures: NonNullable<RichTextEditorProps["features"]> = {
  blockSelection: false,
  codeBlocks: false,
  dragAndDrop: false,
  media: false,
  slash: false,
  tables: false,
}

type SignatureEditorProps = Omit<
  RichTextEditorProps,
  "features" | "initialValue" | "value"
>

export const SignatureEditor = React.forwardRef<
  RichTextEditorRef,
  SignatureEditorProps
>(function SignatureEditor({ initialHtml, ...props }, ref) {
  // A saved signature can change with demo locale. Only a new editing session
  // loads it again; explicit template changes still use the forwarded setHtml.
  const [sessionInitialHtml] = React.useState(() => initialHtml)

  return (
    <RichTextEditor
      {...props}
      features={signatureFeatures}
      initialHtml={sessionInitialHtml}
      ref={ref}
    />
  )
})
