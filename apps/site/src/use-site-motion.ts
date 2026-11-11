import { useEffect, useRef } from "react"

export function useSiteMotion() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (
      !root.current ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return
    const sections = [
      ...root.current.querySelectorAll<HTMLElement>(
        "main > section:not(.hero)"
      ),
    ]
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const section = entry.target as HTMLElement
          section.dataset.siteReveal = "visible"
          observer.unobserve(section)
        }
      },
      { threshold: 0.06 }
    )
    for (const section of sections) {
      // Content already on screen stays visible; only later sections enter on scroll.
      if (section.getBoundingClientRect().top < window.innerHeight) continue
      section.dataset.siteReveal = "pending"
      observer.observe(section)
    }
    return () => {
      observer.disconnect()
      for (const section of sections) delete section.dataset.siteReveal
    }
  }, [])
  return root
}
