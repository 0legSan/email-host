import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClientProvider } from "@tanstack/react-query"
import { RouterProvider } from "@tanstack/react-router"
import { MailThemeProvider, MailDocumentLanguage } from "@workspace/mail-design"
import { cleanPwaUpdateUrl } from "@workspace/pwa/react"

import "@workspace/mail-design/styles.css"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { markPerformance } from "@/lib/performance"
import { ConvexProvider } from "@/lib/convex"
import { queryClient } from "@/lib/query-client"
import { router } from "@/router"
import { MailPwaLanguage } from "@/lib/mail-pwa-language"

cleanPwaUpdateUrl()
markPerformance("app-boot")

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConvexProvider>
        <MailThemeProvider>
          <MailDocumentLanguage>
            <MailPwaLanguage />
            <TooltipProvider>
              <RouterProvider router={router} />
            </TooltipProvider>
          </MailDocumentLanguage>
        </MailThemeProvider>
      </ConvexProvider>
    </QueryClientProvider>
  </StrictMode>
)
