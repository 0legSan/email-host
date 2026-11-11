import type { InlineConfig } from "vite"

export function configureCustomServiceWorkerBuild(config: InlineConfig) {
  const output = config.build?.rollupOptions?.output

  if (!output || Array.isArray(output)) {
    return
  }

  const rolldownOutput = output as typeof output & {
    codeSplitting?: boolean
    inlineDynamicImports?: boolean
  }

  rolldownOutput.codeSplitting = false
  delete rolldownOutput.inlineDynamicImports
}
