import * as React from "react"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
import { Check, ChevronRight, Circle } from "lucide-react"

export const ContextMenu = ContextMenuPrimitive.Root
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger
export const ContextMenuGroup = ContextMenuPrimitive.Group
export const ContextMenuPortal = ContextMenuPrimitive.Portal
export const ContextMenuSub = ContextMenuPrimitive.Sub
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup

export function ContextMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={["editor-ui-context-menu", className]
          .filter(Boolean)
          .join(" ")}
        data-editor-ui-overlay="true"
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
}

export function ContextMenuItem({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Item
      className={[
        "editor-ui-context-menu__item",
        inset ? "editor-ui-context-menu__item--inset" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}

export function ContextMenuCheckboxItem({
  checked,
  children,
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      checked={checked}
      className={["editor-ui-context-menu__item", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <span className="editor-ui-context-menu__indicator" aria-hidden="true">
        <Check />
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

export function ContextMenuRadioItem({
  children,
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
  return (
    <ContextMenuPrimitive.RadioItem
      className={["editor-ui-context-menu__item", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      <span className="editor-ui-context-menu__indicator" aria-hidden="true">
        <Circle />
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )
}

export function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.Label
      className={[
        "editor-ui-context-menu__label",
        inset ? "editor-ui-context-menu__label--inset" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}

export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      className={["editor-ui-context-menu__separator", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}

export function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={["editor-ui-context-menu__shortcut", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}

export function ContextMenuSubTrigger({
  children,
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={[
        "editor-ui-context-menu__item",
        "editor-ui-context-menu__sub-trigger",
        inset ? "editor-ui-context-menu__item--inset" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
      <ChevronRight className="editor-ui-context-menu__chevron" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

export function ContextMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.SubContent
      className={["editor-ui-context-menu", className]
        .filter(Boolean)
        .join(" ")}
      data-editor-ui-overlay="true"
      {...props}
    />
  )
}
