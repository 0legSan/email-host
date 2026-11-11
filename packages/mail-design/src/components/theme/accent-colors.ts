export type HexColor = `#${string}`

export function normalizeHexColor(value: unknown): HexColor | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? (value.trim().toLowerCase() as HexColor)
    : null
}

function channels(hex: HexColor) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
}

export function colorContrast(first: HexColor, second: HexColor) {
  const luminance = (hex: HexColor) => {
    const [r, g, b] = channels(hex).map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const a = luminance(first)
  const b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function mix(first: HexColor, second: HexColor, amount: number): HexColor {
  const target = channels(second)
  return `#${channels(first)
    .map((value, index) =>
      Math.round(value + (target[index] - value) * amount)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`
}

export function customAccentRoles(accent: HexColor, dark: boolean) {
  const foreground =
    colorContrast(accent, "#000000") >= colorContrast(accent, "#ffffff")
      ? "#000000"
      : "#ffffff"
  const background = dark ? "#101214" : "#ffffff"
  const soft = mix(background, accent, dark ? 0.18 : 0.1)
  const target = dark ? "#ffffff" : "#000000"
  let text = accent
  // Text must work on both the panel and its tinted selection background.
  for (
    let step = 1;
    step <= 100 &&
    (colorContrast(text, background) < 4.5 ||
      colorContrast(text, soft) < 4.5 ||
      colorContrast(text, dark ? "#20252a" : "#f3f5f7") < 4.5);
    step++
  ) {
    text = mix(accent, target, step / 100)
  }
  return { accent, foreground, soft, text }
}
