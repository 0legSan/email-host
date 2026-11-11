const storageKey = "email-host:runtime-convex-url"

declare global {
  interface Window {
    __EMAIL_HOST_CONFIG__?: { convexUrl?: unknown }
  }
}

type RuntimeStorage = Pick<Storage, "getItem" | "setItem">

export function resolvePublicConvexUrl(
  configured: unknown,
  storage: RuntimeStorage | undefined
) {
  const current = readPublicUrl(configured)
  if (current) {
    try {
      storage?.setItem(storageKey, current)
    } catch {
      // A configured instance remains usable when browser storage is blocked.
    }
    return current
  }

  try {
    const saved = readPublicUrl(storage?.getItem(storageKey))
    if (saved) return saved
  } catch {
    // The first offline visit has no usable saved instance configuration.
  }
  throw new Error("Email Host runtime configuration is unavailable")
}

function readPublicUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return
  try {
    const url = new URL(value)
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    ) {
      return url.origin
    }
  } catch {
    return undefined
  }
}
