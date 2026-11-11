import * as React from "react"
import {
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  Portal,
  useComboboxContext,
  useComboboxStore,
  type ComboboxItemProps,
} from "@ariakit/react"
import { filterWords } from "@platejs/combobox"
import {
  useComboboxInput,
  useHTMLInputCursorState,
  type UseComboboxInputResult,
} from "@platejs/combobox/react"
import type { Point, TElement } from "platejs"
import { useComposedRef, useEditorRef } from "platejs/react"

type FilterFn = (
  item: { group?: string; keywords?: string[]; label?: string; value: string },
  search: string
) => boolean

type InlineComboboxContextValue = {
  filter: FilterFn | false
  inputProps: UseComboboxInputResult["props"]
  inputRef: React.RefObject<HTMLInputElement | null>
  removeInput: UseComboboxInputResult["removeInput"]
  setHasEmpty: (hasEmpty: boolean) => void
  showTrigger: boolean
  trigger: string
}

const InlineComboboxContext =
  React.createContext<InlineComboboxContextValue | null>(null)

const defaultFilter: FilterFn = (
  { group, keywords = [], label, value },
  search
) => {
  const normalizedSearch = search.trim().replace(/^\/+/, "")

  if (normalizedSearch.length === 0) {
    return true
  }

  const terms = new Set([value, ...keywords, group, label].filter(Boolean))

  return Array.from(terms).some((term) => filterWords(term!, normalizedSearch))
}

export function InlineCombobox({
  children,
  element,
  filter = defaultFilter,
  hideWhenNoValue = false,
  setValue: setValueProp,
  showTrigger = true,
  trigger,
  value: valueProp,
}: {
  children: React.ReactNode
  element: TElement
  filter?: FilterFn | false
  hideWhenNoValue?: boolean
  setValue?: (value: string) => void
  showTrigger?: boolean
  trigger: string
  value?: string
}) {
  const editor = useEditorRef()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const cursorState = useHTMLInputCursorState(inputRef)
  const [valueState, setValueState] = React.useState("")
  const [hasEmpty, setHasEmpty] = React.useState(false)
  const value = valueProp ?? valueState
  const insertPoint = React.useRef<Point | null>(null)

  React.useEffect(() => {
    const path = editor.api.findPath(element)

    if (!path) {
      return
    }

    const point = editor.api.before(path)

    if (!point) {
      return
    }

    const pointRef = editor.api.pointRef(point)
    insertPoint.current = pointRef.current

    return () => {
      pointRef.unref()
    }
  }, [editor, element])

  const { props: inputProps, removeInput } = useComboboxInput({
    autoFocus: true,
    cancelInputOnBlur: true,
    cursorState,
    ref: inputRef,
    onCancelInput: (cause) => {
      if (cause !== "backspace") {
        const valueWithoutTrigger = value.startsWith(trigger)
          ? value.slice(trigger.length)
          : value

        editor.tf.insertText(trigger + valueWithoutTrigger, {
          at: insertPoint.current ?? undefined,
        })
      }

      if (cause === "arrowLeft" || cause === "arrowRight") {
        editor.tf.move({
          distance: 1,
          reverse: cause === "arrowLeft",
        })
      }
    },
  })

  const store = useComboboxStore({
    setValue: (nextValue) => {
      React.startTransition(() => {
        setValueProp?.(nextValue)

        if (valueProp === undefined) {
          setValueState(nextValue)
        }
      })
    },
  })
  const items = store.useState("items")

  React.useEffect(() => {
    if (!store.getState().activeId) {
      store.setActiveId(store.first())
    }
  }, [items, store])

  const contextValue = React.useMemo<InlineComboboxContextValue>(
    () => ({
      filter,
      inputProps,
      inputRef,
      removeInput,
      setHasEmpty,
      showTrigger,
      trigger,
    }),
    [filter, inputProps, removeInput, showTrigger, trigger]
  )

  return (
    <span contentEditable={false}>
      <ComboboxProvider
        open={
          (items.length > 0 || hasEmpty) &&
          (!hideWhenNoValue || value.length > 0)
        }
        store={store}
      >
        <InlineComboboxContext.Provider value={contextValue}>
          {children}
        </InlineComboboxContext.Provider>
      </ComboboxProvider>
    </span>
  )
}

export function InlineComboboxInput({
  className,
  ref: propRef,
  ...props
}: React.HTMLAttributes<HTMLInputElement> & {
  ref?: React.RefObject<HTMLInputElement | null>
}) {
  const context = useInlineComboboxContext()
  const store = useComboboxContext()!
  const value = store.useState("value")
  const ref = useComposedRef(propRef, context.inputRef)

  return (
    <>
      {context.showTrigger ? context.trigger : null}
      <span className="editor-ui-combobox__input-measure">
        <span aria-hidden="true" className="editor-ui-combobox__input-shadow">
          {value || "\u200B"}
        </span>
        <Combobox
          ref={ref}
          className={["editor-ui-combobox__input", className]
            .filter(Boolean)
            .join(" ")}
          value={value}
          autoSelect
          {...context.inputProps}
          {...props}
        />
      </span>
    </>
  )
}

export function InlineComboboxContent({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxPopover>) {
  return (
    <Portal>
      <ComboboxPopover
        className={["editor-ui editor-ui-combobox", className]
          .filter(Boolean)
          .join(" ")}
        data-editor-ui-overlay="true"
        {...props}
      />
    </Portal>
  )
}

export function InlineComboboxItem({
  className,
  focusEditor = true,
  group,
  keywords,
  label,
  onClick,
  ...props
}: {
  focusEditor?: boolean
  group?: string
  keywords?: string[]
  label?: string
} & ComboboxItemProps &
  Required<Pick<ComboboxItemProps, "value">>) {
  const { filter, removeInput } = useInlineComboboxContext()
  const store = useComboboxContext()!
  const search = filter ? store.useState("value") : ""
  const visible = React.useMemo(
    () =>
      !filter ||
      filter({ group, keywords, label, value: props.value }, search as string),
    [filter, group, keywords, label, props.value, search]
  )

  if (!visible) {
    return null
  }

  return (
    <ComboboxItem
      className={["editor-ui-combobox__item", className]
        .filter(Boolean)
        .join(" ")}
      onClick={(event) => {
        removeInput(focusEditor)
        onClick?.(event)
      }}
      {...props}
    />
  )
}

export function InlineComboboxEmpty({
  children,
  className,
}: React.HTMLAttributes<HTMLDivElement>) {
  const { setHasEmpty } = useInlineComboboxContext()
  const store = useComboboxContext()!
  const items = store.useState("items")

  React.useEffect(() => {
    setHasEmpty(true)

    return () => setHasEmpty(false)
  }, [setHasEmpty])

  if (items.length > 0) {
    return null
  }

  return (
    <div
      className={[
        "editor-ui-combobox__item",
        "editor-ui-combobox__empty",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  )
}

export function InlineComboboxGroup({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxGroup>) {
  return (
    <ComboboxGroup
      className={["editor-ui-combobox__group", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}

export function InlineComboboxGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxGroupLabel>) {
  return (
    <ComboboxGroupLabel
      className={["editor-ui-combobox__group-label", className]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  )
}

function useInlineComboboxContext() {
  const context = React.useContext(InlineComboboxContext)

  if (!context) {
    throw new Error(
      "InlineCombobox components must be rendered inside InlineCombobox"
    )
  }

  return context
}
