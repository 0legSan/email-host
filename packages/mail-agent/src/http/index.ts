import { Hono } from "hono"

import type { MailAgent } from "../mail-agent"
import { createAccountRoutes } from "./account-routes"
import { createAuthRoutes } from "./auth-routes"
import { createBootstrapRoutes } from "./bootstrap-routes"
import { createMailReadRoutes } from "./mail-read-routes"
import { createMailSendRoutes } from "./mail-send-routes"
import { createPreferencesRoutes } from "./preferences-routes"
import { createPushRoutes } from "./push-routes"

export function createHealthRoutes() {
  const app = new Hono()

  app.get("/health", (context) =>
    context.json({
      ok: true,
      data: {
        status: "ok",
      },
    })
  )

  return app
}

export function createMailAgentRoutes(agent: MailAgent) {
  const app = new Hono()

  app.route("/", createAuthRoutes(agent))
  app.route("/", createBootstrapRoutes(agent))
  app.route("/", createAccountRoutes(agent))
  app.route("/", createMailReadRoutes(agent))
  app.route("/", createMailSendRoutes(agent))
  app.route("/", createPreferencesRoutes(agent))
  app.route("/", createPushRoutes(agent))
  return app
}
