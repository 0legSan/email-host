import { useId, useState } from "react"
import { IconArrowUpRight } from "@tabler/icons-react"
import { usePreviewInteraction } from "./use-preview-interaction"
import { copy, type Locale } from "./content"

export function MailPreview({ locale }: { locale: Locale }) {
  const c = copy[locale]
  const [loaded, setLoaded] = useState(false)
  const frameId = useId()
  const hintId = useId()
  const { interactive, setInteractive, previewRef, frameRef, toggleRef } =
    usePreviewInteraction(loaded)
  return (
    <div
      className="mail-preview"
      data-interactive={interactive}
      ref={previewRef}
    >
      <div className="preview-caption">
        <div className="preview-context">
          <span>{c.local}</span>
          <span id={hintId} className="preview-scroll-hint" aria-live="polite">
            {interactive ? c.previewActiveHint : c.previewBrowseHint}
          </span>
        </div>
        <div className="preview-actions">
          <button
            className="preview-toggle"
            type="button"
            ref={toggleRef}
            aria-controls={frameId}
            aria-describedby={hintId}
            aria-pressed={interactive}
            disabled={!loaded}
            onClick={() => setInteractive((current) => !current)}
          >
            {interactive ? c.previewExit : c.previewInteract}
          </button>
          <a href={`/demo/?lang=${locale}`}>
            {c.full}
            <IconArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className="preview-application" aria-busy={!loaded}>
        {!loaded && (
          <div className="preview-loading" role="status">
            {c.loadingDemo}
          </div>
        )}
        <iframe
          id={frameId}
          ref={frameRef}
          inert={!interactive}
          aria-hidden={!interactive}
          tabIndex={interactive ? 0 : -1}
          src={`/demo/?embed=1&lang=${locale}`}
          title={c.demoFrame}
          loading="lazy"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  )
}
