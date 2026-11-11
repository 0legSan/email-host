import { useEffect, useRef, useState } from "react"

export function usePreviewInteraction(loaded: boolean) {
  const [interactive, setInteractive] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const frame = frameRef.current
    const preview = previewRef.current
    if (!interactive || !loaded || !frame || !preview) return

    const menuEscapes = new WeakSet<KeyboardEvent>()
    let exitTimeout: number | undefined
    function rememberMenu(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      // Read before app handlers can remove a menu that does not cancel Escape.
      const menus = frame?.contentDocument?.querySelectorAll(
        '[role="menu"], [role="listbox"]'
      )
      if (menus && [...menus].some((menu) => menu.getClientRects().length > 0))
        menuEscapes.add(event)
    }
    function exitPreview(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        menuEscapes.has(event)
      )
        return
      window.clearTimeout(exitTimeout)
      // App window listeners can be registered after ours. A task, rather than
      // a microtask, lets the entire native dispatch finish before deciding.
      exitTimeout = window.setTimeout(() => {
        if (event.defaultPrevented) return
        setInteractive(false)
        toggleRef.current?.focus({ preventScroll: true })
      }, 0)
    }

    let frameListeners = new AbortController()
    function connectFrames() {
      frameListeners.abort()
      frameListeners = new AbortController()
      const { signal } = frameListeners
      function connect(frameWindow: Window | null) {
        if (!frameWindow) return
        try {
          const doc = frameWindow.document
          frameWindow.addEventListener("keydown", rememberMenu, {
            capture: true,
            signal,
          })
          frameWindow.addEventListener("keydown", exitPreview, { signal })
          doc.addEventListener("load", onFrameLoad, { capture: true, signal })
          for (const child of doc.querySelectorAll("iframe"))
            connect(child.contentWindow)
        } catch {
          // Cross-origin content is not accessible; the site exit button remains available.
        }
      }
      connect(frame?.contentWindow ?? null)
    }
    function onFrameLoad(event: Event) {
      if ((event.target as Element | null)?.nodeName === "IFRAME")
        connectFrames()
    }

    // Keyboard events do not bubble across frame boundaries. The reader also
    // replaces its document, so refresh these subscriptions after frame loads.
    frame.addEventListener("load", connectFrames)
    window.addEventListener("keydown", rememberMenu, true)
    window.addEventListener("keydown", exitPreview)
    // Explicit entry aligns a viewport-sized workspace; ordinary page scrolling
    // remains native and is never forwarded from the frame with delta handlers.
    preview.scrollIntoView({ block: "start", behavior: "instant" })
    connectFrames()
    frame.focus({ preventScroll: true })

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.99) return
        setInteractive(false)
        frame.blur()
      },
      { threshold: 0.99 }
    )
    observer.observe(preview)

    return () => {
      observer.disconnect()
      window.clearTimeout(exitTimeout)
      frameListeners.abort()
      frame.removeEventListener("load", connectFrames)
      window.removeEventListener("keydown", rememberMenu, true)
      window.removeEventListener("keydown", exitPreview)
    }
  }, [interactive, loaded])

  return { interactive, setInteractive, previewRef, frameRef, toggleRef }
}
