import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { VitePWA } from "vite-plugin-pwa"
import { configureCustomServiceWorkerBuild } from "@workspace/pwa/vite"

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, "")

  if (command === "build" && !env.VITE_CONVEX_URL) {
    throw new Error("VITE_CONVEX_URL is required for a production build")
  }

  return {
    build: {
      chunkSizeWarningLimit: 2048,
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        filename: "sw.ts",
        injectRegister: false,
        manifest: false,
        registerType: "prompt",
        srcDir: "src",
        strategies: "injectManifest",
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
          globIgnores: ["**/runtime-config.js"],
        },
        integration: {
          configureCustomSWViteBuild: configureCustomServiceWorkerBuild,
        },
      }),
    ],
    resolve: {
      alias: [
        {
          find: "@workspace/mail-design/styles.css",
          replacement: path.resolve(
            __dirname,
            "../../packages/mail-design/src/styles.css"
          ),
        },
        {
          find: "@workspace/mail-design",
          replacement: path.resolve(
            __dirname,
            "../../packages/mail-design/src"
          ),
        },
        {
          find: "@workspace/ui/globals.css",
          replacement: path.resolve(
            __dirname,
            "../../packages/ui/src/styles/globals.css"
          ),
        },
        {
          find: "@workspace/editor-ui",
          replacement: path.resolve(__dirname, "../../packages/editor-ui/src"),
        },
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
      ],
    },
  }
})
