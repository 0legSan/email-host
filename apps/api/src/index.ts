import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"

import { createMailAgent, parseMailAgentConfig } from "@workspace/mail-agent"
import {
  createHealthRoutes,
  createMailAgentRoutes,
} from "@workspace/mail-agent/http"

const app = new Hono()
const port = Number(process.env.PORT ?? 3001)
const config = parseMailAgentConfig(process.env)
const agent = createMailAgent(config)

await agent.seedOwnerUser()

if (config.appReleaseVersion) {
  await agent.pushNotifications.notifyAppUpdate(config.appReleaseVersion)
}

app.route("/", createHealthRoutes())
app.use(
  "/api/*",
  cors({
    origin: config.webOrigins,
    credentials: true,
  })
)
app.route("/api", createMailAgentRoutes(agent))

const server = serve({
  fetch: app.fetch,
  port,
})

console.log(`API listening on http://localhost:${port}`)

async function close() {
  server.close()
  await agent.close()
}

process.once("SIGINT", () => {
  void close().finally(() => process.exit(0))
})

process.once("SIGTERM", () => {
  void close().finally(() => process.exit(0))
})
