import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { MailThemeProvider } from "@workspace/mail-design"
import { UiLocaleContext } from "@workspace/ui/lib/ui-locale"
import "./design.css"
import "./site.css"
import { Site } from "./site"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MailThemeProvider>
      <UiLocaleContext
        value={window.location.pathname.startsWith("/en") ? "en" : "ru"}
      >
        <Site />
      </UiLocaleContext>
    </MailThemeProvider>
  </StrictMode>
)
