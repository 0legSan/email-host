import path from "node:path"
import { readFileSync } from "node:fs"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const root = import.meta.dirname
const source = (relative: string) => path.resolve(root, relative)

export default defineConfig({
  publicDir: "../web/public",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "email-host-site-documents",
      generateBundle() {
        for (const name of ["robots.txt", "sitemap.xml"]) {
          this.emitFile({
            type: "asset",
            fileName: name,
            source: readFileSync(source(name), "utf8"),
          })
        }
      },
    },
  ],
  resolve: {
    alias: [
      // Demo has no backend. These replacements exist only in the site's build.
      {
        find: /^(?:@\/lib\/|\.\/)mail-storage-namespace$/,
        replacement: source("src/demo/storage-namespace.ts"),
      },
      {
        find: "@/lib/api-transport",
        replacement: source("src/demo/transport.ts"),
      },
      {
        find: "@/lib/pwa",
        replacement: source("src/demo/notifications-adapter.ts"),
      },
      {
        find: "convex/react",
        replacement: source("src/demo/convex-adapter.ts"),
      },
      {
        find: "@workspace/pwa/react",
        replacement: source("src/demo/pwa-adapter.ts"),
      },
      {
        find: "@workspace/mail-design/styles.css",
        replacement: source("../../packages/mail-design/src/styles.css"),
      },
      {
        find: "@workspace/mail-design",
        replacement: source("../../packages/mail-design/src"),
      },
      {
        find: "@workspace/ui/globals.css",
        replacement: source("../../packages/ui/src/styles/globals.css"),
      },
      {
        find: "@workspace/editor-ui",
        replacement: source("../../packages/editor-ui/src"),
      },
      { find: "@workspace/pwa", replacement: source("../../packages/pwa/src") },
      { find: "@", replacement: source("../web/src") },
    ],
  },
  build: {
    chunkSizeWarningLimit: 2048,
    rollupOptions: {
      input: {
        main: source("index.html"),
        en: source("en/index.html"),
        demo: source("demo/index.html"),
      },
    },
  },
})
