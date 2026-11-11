import {
  IconArrowUpRight,
  IconPalette,
  IconBrandDocker,
  IconCode,
  IconDevices,
  IconUserPlus,
} from "@tabler/icons-react"
import { EmailHostLogo, MailAppearanceSettings } from "@workspace/mail-design"
import { copy, type Locale } from "./content"
import { MailPreview } from "./mail-preview"
import { DeviceIllustration, SyncIllustration } from "./site-illustrations"
import { useSiteMotion } from "./use-site-motion"

export function Site() {
  const motionRoot = useSiteMotion()
  const locale: Locale = window.location.pathname.startsWith("/en")
    ? "en"
    : "ru"
  const c = copy[locale]
  const configuredSource: unknown =
    import.meta.env.VITE_SOURCE_URL ?? "https://github.com/0legSan/email-host"
  let sourceUrl: string | undefined
  if (
    typeof configuredSource === "string" &&
    /^https?:\/\//.test(configuredSource)
  )
    sourceUrl = configuredSource
  return (
    <div className="site" id="top" ref={motionRoot}>
      <a className="skip-link" href="#main">
        {c.skip}
      </a>
      <header className="site-header shell">
        <a
          className="brand"
          href={locale === "ru" ? "/" : "/en/"}
          aria-label="Email Host"
        >
          <EmailHostLogo className="brand-logo" />
          <span>Email Host</span>
        </a>
        <nav aria-label={locale === "ru" ? "Навигация" : "Navigation"}>
          {["features", "sync", "deploy"].map((id, index) => (
            <a key={id} href={`#${id}`}>
              {c.nav[index]}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <a
            className="language"
            href={locale === "ru" ? "/en/" : "/"}
            lang={locale === "ru" ? "en" : "ru"}
            hrefLang={locale === "ru" ? "en" : "ru"}
          >
            {locale === "ru" ? "EN" : "RU"}
          </a>
          <a
            className="header-appearance"
            href="#appearance"
            aria-label={c.changeAccent}
          >
            <IconPalette size={20} aria-hidden="true" />
          </a>
          <a className="button compact" href={`/demo/?lang=${locale}`}>
            {c.demo} <IconArrowUpRight size={19} aria-hidden="true" />
          </a>
        </div>
      </header>
      <main id="main">
        <section className="hero shell">
          <div className="hero-mark" aria-hidden="true">
            @
          </div>
          <span className="hero-corner top-left" aria-hidden="true" />
          <span className="hero-corner top-right" aria-hidden="true" />
          <div className="hero-grid">
            <h1>
              {c.title.split("\n").map((line, index) => (
                <span key={line} className={index ? "accent-text" : undefined}>
                  {line}
                </span>
              ))}
            </h1>
            <div className="hero-copy">
              <p>{c.intro}</p>
              <div className="hero-ctas">
                <a className="button" href={`/demo/?lang=${locale}`}>
                  {c.demo}
                  <IconArrowUpRight size={19} aria-hidden="true" />
                </a>
                <a className="button secondary" href="#appearance">
                  <IconPalette size={18} aria-hidden="true" />
                  {c.changeAccent}
                </a>
              </div>
              <small>{c.hint}</small>
            </div>
          </div>
          <div className="hero-facts">
            <span>
              <IconCode size={16} aria-hidden="true" />
              Open source
            </span>
            <span>
              <IconBrandDocker size={18} aria-hidden="true" />
              Self-hosted
            </span>
            <span>
              <IconDevices size={17} aria-hidden="true" />
              Web & PWA
            </span>
          </div>
        </section>
        <section
          className="preview-section shell"
          id="features"
          aria-labelledby="preview-title"
        >
          <MailPreview locale={locale} />
          <div className="section-heading preview-explanation">
            <h2 id="preview-title">{c.preview}</h2>
            <p>{c.previewText}</p>
          </div>
        </section>
        <section className="sync-section shell" id="sync">
          <div className="section-heading">
            <h2>{c.syncTitle}</h2>
            <p>{c.syncText}</p>
          </div>
          <SyncIllustration locale={locale} />
          <ol className="sync-flow">
            {c.syncSteps.map(([title, text], index) => (
              <li key={title}>
                <span className="step-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
                {index < 2 && (
                  <span className="flow-arrow" aria-hidden="true">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
          <p className="sync-note">{c.syncNote}</p>
        </section>
        <section className="appearance-section shell" id="appearance">
          <div className="appearance-copy">
            <h2>{c.ownTitle}</h2>
            <p>{c.ownText}</p>
            <DeviceIllustration />
          </div>
          <div className="appearance-panel">
            <h3>{c.appearance}</h3>
            <p>{c.appearanceText}</p>
            <MailAppearanceSettings locale={locale} showLanguage={false} />
          </div>
        </section>
        <section className="deploy-section shell" id="deploy">
          <div className="section-heading">
            <h2>{c.deployTitle}</h2>
            <p>{c.deployText}</p>
          </div>
          <ol className="deploy-steps">
            {c.deploySteps.map(([title, text], index) => (
              <li key={title}>
                <span className="step-number">0{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
          {sourceUrl && (
            <a
              className="text-link source-link"
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.source}
              <IconArrowUpRight size={19} aria-hidden="true" />
            </a>
          )}
        </section>
        <section className="friends-section shell">
          <div className="section-heading">
            <h2>{c.friendsTitle}</h2>
            <p>{c.friendsText}</p>
          </div>
          <ol className="friends-steps">
            {c.friendsSteps.map(([title, text], index) => (
              <li key={title}>
                <span className="friends-icon" aria-hidden="true">
                  {index === 0 ? (
                    <IconUserPlus size={26} stroke={1.5} />
                  ) : index === 1 ? (
                    <IconArrowUpRight size={26} stroke={1.5} />
                  ) : (
                    <EmailHostLogo />
                  )}
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="faq-section shell">
          <h2>{c.faqTitle}</h2>
          <div>
            {c.faq.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing shell">
          <EmailHostLogo className="closing-logo" />
          <div>
            <h2>{c.end}</h2>
            <p>{c.endText}</p>
            <a className="button" href={`/demo/?lang=${locale}`}>
              {c.demo}
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </main>
      <footer className="site-footer shell">
        <a className="brand" href="#top">
          <EmailHostLogo className="brand-logo" />
          <span>Email Host</span>
        </a>
        <p>{c.footer}</p>
        <a href="#top">{c.top} ↑</a>
      </footer>
    </div>
  )
}
