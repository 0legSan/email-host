import IconAlertCircle from "@tabler/icons-react/dist/esm/icons/IconAlertCircle.mjs"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"
import { Input } from "@workspace/ui/components/input"
import type { ComponentProps, ReactNode } from "react"

export const authInputClassName =
  "h-10 w-full border border-[#cfd6dd] bg-mail-panel-subtle px-3 text-sm transition outline-none focus:border-mail-selected dark:border-mail-border dark:bg-mail-canvas dark:focus:border-mail-selected"

type AuthFieldProps = ComponentProps<typeof Input> & {
  label: string
}

export function AuthField({ label, ...props }: AuthFieldProps) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-[#4c5661] dark:text-[#c4ccd4]">
      {label}
      <Input className={authInputClassName} {...props} />
    </label>
  )
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div className="text-mail-danger flex items-start gap-2 border border-[#e6b8b0] bg-[#fff4f1] p-3 text-sm dark:border-[#6c3a33] dark:bg-[#281d1b]">
      <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

export function AuthChecking({ children }: { children: ReactNode }) {
  return (
    <div className="text-mail-text-muted flex items-center gap-3 text-sm">
      <IconLoader2 className="size-5 animate-spin" />
      {children}
    </div>
  )
}

export function AuthExpiry({ children }: { children: ReactNode }) {
  return (
    <p className="dark:text-mail-positive border border-[#d8e6df] bg-[#f1faf6] p-3 text-sm text-[#176d59] dark:border-[#26483c] dark:bg-[#132722]">
      {children}
    </p>
  )
}
