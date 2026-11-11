import { useId } from "react"
import { Slider } from "radix-ui"
import { useUiLocale } from "@workspace/ui/lib/ui-locale"
import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

export function ColorPicker({
  value,
  onValueChange,
}: {
  value: string
  onValueChange: (value: string) => void
}) {
  const locale = useUiLocale()
  const ru = locale === "ru"
  const id = useId()
  const channels = [1, 3, 5].map((offset) =>
    parseInt(value.slice(offset, offset + 2), 16)
  )
  const names = ru ? ["Красный", "Зеленый", "Синий"] : ["Red", "Green", "Blue"]
  const gradients = [
    "linear-gradient(to right, #000, #f00)",
    "linear-gradient(to right, #000, #0f0)",
    "linear-gradient(to right, #000, #00f)",
  ]

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          type="button"
          aria-label={ru ? "Выбрать свой цвет" : "Choose custom color"}
          className="h-11 w-16 p-1"
        >
          <span
            aria-hidden="true"
            className="h-full w-full border border-border"
            style={{ backgroundColor: value }}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={ru ? "Свой цвет" : "Custom color"}
        className="grid w-72 gap-4"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-9 shrink-0 border border-border"
            style={{ backgroundColor: value }}
          />
          <span className="font-mono text-sm">{value.toUpperCase()}</span>
        </div>
        {channels.map((channel, index) => (
          <div key={index} className="grid gap-1">
            <div className="flex justify-between gap-3 text-xs">
              <span id={`${id}-${index}`}>{names[index]}</span>
              <span>{channel}</span>
            </div>
            <Slider.Root
              className="relative flex h-9 touch-none items-center select-none"
              min={0}
              max={255}
              step={1}
              value={[channel]}
              onValueChange={([next]) => {
                if (next === undefined) return
                onValueChange(
                  `#${channels.map((current, offset) => (offset === index ? next : current).toString(16).padStart(2, "0")).join("")}`
                )
              }}
            >
              <Slider.Track
                className="relative h-3 grow border border-border"
                style={{ background: gradients[index] }}
              />
              <Slider.Thumb
                aria-labelledby={`${id}-${index}`}
                className="block size-5 border-2 border-foreground bg-background shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </Slider.Root>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
