import type { ReactNode } from "react"
import IconAlertCircle from "@tabler/icons-react/dist/esm/icons/IconAlertCircle.mjs"

export function OfflineCacheStatusRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#e2e7eb] py-2 last:border-b-0 dark:border-[#2b3035]">
      <dt className="text-[#68727d] dark:text-[#a7b0ba]">{label}</dt>
      <dd className="font-semibold text-[#20252a] dark:text-[#eef2f4]">
        {value}
      </dd>
    </div>
  )
}

export function SettingsField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-xs font-semibold text-[#4c5661] dark:text-[#c4ccd4]">
      {label}
      {children}
    </label>
  )
}

export function SettingsSelectField({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-1.5 text-xs font-semibold text-[#4c5661] dark:text-[#c4ccd4]">
      <span>{label}</span>
      {children}
    </div>
  )
}

export function SettingsError({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 border border-[#e6b8b0] bg-[#fff4f1] p-3 text-sm text-[#963828] dark:border-[#6c3a33] dark:bg-[#281d1b] dark:text-[#ffb3a7]">
      <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </div>
  )
}
