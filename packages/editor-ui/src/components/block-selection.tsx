import * as React from "react"

export function BlockSelection(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={["editor-ui-block-selection", props.className]
        .filter(Boolean)
        .join(" ")}
    />
  )
}
