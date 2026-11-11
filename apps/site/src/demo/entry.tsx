import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MailThemeProvider, MailDocumentLanguage } from "@workspace/mail-design"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { Demo } from "./demo"
import "../design.css"
import "./demo.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0 },
  },
})

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MailThemeProvider>
        <MailDocumentLanguage>
          <TooltipProvider>
            <Demo />
          </TooltipProvider>
        </MailDocumentLanguage>
      </MailThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
