import { forwardRef, type ComponentPropsWithoutRef } from "react"
import { cn } from "@workspace/ui/lib/utils"

export type MailComposeViewMode = "floating" | "modal" | "page"

type MailComposeSurfaceProps = ComponentPropsWithoutRef<"form"> & {
  viewMode: MailComposeViewMode
}

export const MailComposeSurface = forwardRef<
  HTMLFormElement,
  MailComposeSurfaceProps
>(function MailComposeSurface({ className, viewMode, ...props }, ref) {
  return (
    <form
      aria-modal={viewMode === "modal" ? true : undefined}
      className={cn(
        "border-mail-border bg-mail-panel pointer-events-auto flex min-h-0 flex-col border shadow-[0_24px_80px_rgba(15,23,42,0.2)]",
        viewMode === "floating" &&
          "h-[calc(100svh-1.5rem)] max-h-[720px] w-full overflow-hidden rounded-md sm:w-[640px]",
        viewMode === "modal" &&
          "h-[calc(100svh-2rem)] max-h-[760px] w-full max-w-[880px] overflow-hidden rounded-md",
        viewMode === "page" &&
          "min-h-full w-full overflow-hidden border-x-0 shadow-none sm:min-h-[calc(100svh-2rem)] sm:border-x lg:mx-auto lg:max-w-[1120px]",
        className
      )}
      ref={ref}
      role={viewMode === "page" ? undefined : "dialog"}
      {...props}
    />
  )
})
