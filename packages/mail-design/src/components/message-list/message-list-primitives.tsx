import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react"
import { cn } from "@workspace/ui/lib/utils"

type MailMessageListFrameProps = ComponentPropsWithoutRef<"section"> & {
  hiddenOnNarrow?: boolean
}

export const MailMessageListFrame = forwardRef<
  HTMLElement,
  MailMessageListFrameProps
>(function MailMessageListFrame(
  { children, className, hiddenOnNarrow = false, ...props },
  ref
) {
  return (
    <section
      className={cn(
        "border-mail-border bg-mail-panel relative min-h-0 min-w-0 border-r",
        hiddenOnNarrow && "hidden lg:flex lg:flex-col",
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
    </section>
  )
})

export function MailMessageListHeader({ children }: { children: ReactNode }) {
  return (
    <header className="border-mail-border bg-mail-panel shrink-0 border-b">
      {children}
    </header>
  )
}

export const MailMessageListBody = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(function MailMessageListBody({ children, className, ...props }, ref) {
  return (
    <div
      className={cn("custom-scrollbar min-h-0 flex-1", className)}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  )
})

type MailMessageRowFrameProps = {
  active?: boolean
  children: ReactNode
  selected?: boolean
  unread?: boolean
}

export function MailMessageRowFrame({
  active = false,
  children,
  selected = false,
  unread = false,
}: MailMessageRowFrameProps) {
  return (
    <div
      className={cn(
        "border-mail-border-subtle border-b transition-colors",
        unread && "bg-[#f7fbff] dark:bg-[#141d27]",
        selected && "bg-mail-accent-soft",
        active && "border-l-mail-accent border-l-[3px]"
      )}
    >
      {children}
    </div>
  )
}
