/* eslint-disable react-refresh/only-export-components -- lazy components and preload helpers intentionally share import factories. */
import * as React from "react"
import IconLoader2 from "@tabler/icons-react/dist/esm/icons/IconLoader2.mjs"

const composePanelImport = () => import("@/components/compose-panel")
const settingsPanelImport = () => import("@/components/settings-panel")

export const ComposePanel = React.lazy(async () => ({
  default: (await composePanelImport()).ComposePanel,
}))

export const SettingsPanel = React.lazy(async () => ({
  default: (await settingsPanelImport()).SettingsPanel,
}))

export function preloadComposePanel() {
  void composePanelImport()
}

export function preloadSettingsPanel() {
  void settingsPanelImport()
}

export function LazyPanelFallback({
  label,
  page = false,
}: {
  label: string
  page?: boolean
}) {
  return (
    <div
      role="status"
      className={
        page
          ? "bg-mail-canvas text-mail-text grid h-svh place-items-center p-4"
          : "fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"
      }
    >
      <div className="flex items-center gap-3 border border-[#d8dee5] bg-white px-4 py-3 text-sm font-semibold text-[#20252a] shadow-[0_24px_80px_rgba(15,23,42,0.24)] dark:border-[#30353a] dark:bg-[#181b1f] dark:text-[#eef2f4]">
        <IconLoader2 className="size-4 animate-spin" />
        {label}
      </div>
    </div>
  )
}
