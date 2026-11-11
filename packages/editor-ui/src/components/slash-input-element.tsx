import { useEditorLabels } from "./editor-label-context"
import { type TComboboxInputElement } from "platejs"
import { PlateElement, type PlateElementProps } from "platejs/react"

import {
  createDefaultEditorCommands,
  defaultEditorCommandLabels,
} from "../commands"
import type { EditorCommand } from "../types/editor"
import { useEditorCommands } from "./editor-command-context"
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox"

const slashCommands = createDefaultEditorCommands({
  labels: defaultEditorCommandLabels,
})

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const labels = useEditorLabels()
  const { editor, element } = props
  const commands = useEditorCommands(slashCommands)
  const groups = groupCommands(commands, labels)

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />
        <InlineComboboxContent>
          <InlineComboboxEmpty>{labels.slashEmpty}</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={items[0]?.id ?? group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>
              {items.map((item) => (
                <InlineComboboxItem
                  group={group}
                  key={item.id}
                  keywords={item.keywords}
                  label={item.label}
                  value={item.blockType ?? item.id}
                  onClick={() =>
                    item.run({
                      command: item,
                      editor,
                      focusEditor: () => editor.tf.focus(),
                      preset: "email",
                    })
                  }
                >
                  <span
                    className="editor-ui-combobox__item-icon"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <span className="editor-ui-combobox__item-label">
                    {item.label}
                  </span>
                </InlineComboboxItem>
              ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  )
}

function groupCommands(
  commands: EditorCommand[],
  labels: ReturnType<typeof useEditorLabels>
) {
  const groups = new Map<string, EditorCommand[]>()

  for (const command of commands) {
    const group = command.group || "basic"
    groups.set(group, [...(groups.get(group) ?? []), command])
  }

  return Array.from(groups, ([group, items]) => ({
    group:
      group === "basic"
        ? labels.basicBlocks
        : group === "rich"
          ? labels.richBlocks
          : group === "media"
            ? labels.media
            : group,
    items,
  }))
}
