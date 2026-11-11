import type { AuthConfig } from "convex/server"

export default {
  providers: [
    {
      type: "customJwt",
      applicationID: "email-host-convex",
      issuer:
        process.env.CONVEX_AUTH_ISSUER ?? "http://127.0.0.1:3001",
      jwks:
        process.env.CONVEX_AUTH_JWKS ??
        "http://host.docker.internal:3001/api/auth/jwks",
      algorithm: "RS256",
    },
  ],
} satisfies AuthConfig
