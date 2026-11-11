import * as React from "react"
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react"

import { convexAuthEventName } from "@/lib/convex-session"
import { resolvePublicConvexUrl } from "@/lib/public-runtime-config"

const convexUrl =
  import.meta.env.VITE_RUNTIME_CONFIG === "true"
    ? resolvePublicConvexUrl(
        window.__EMAIL_HOST_CONFIG__?.convexUrl,
        readRuntimeStorage()
      )
    : (import.meta.env.VITE_CONVEX_URL ?? "http://127.0.0.1:3210")

function readRuntimeStorage() {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const convex = new ConvexReactClient(convexUrl, {
  skipConvexDeploymentUrlCheck: true,
})

export function ConvexProvider({ children }: React.PropsWithChildren) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useSessionAuth}>
      {children}
    </ConvexProviderWithAuth>
  )
}

function useSessionAuth() {
  const [authenticated, setAuthenticated] = React.useState(true)

  React.useEffect(() => {
    const handleAuth = (event: Event) => {
      setAuthenticated((event as CustomEvent<boolean>).detail)
    }
    window.addEventListener(convexAuthEventName, handleAuth)
    return () => window.removeEventListener(convexAuthEventName, handleAuth)
  }, [])

  const fetchAccessToken = React.useCallback(async () => {
    const response = await fetch("/api/auth/convex-token", {
      credentials: "include",
    })
    if (!response.ok) {
      setAuthenticated(false)
      return null
    }
    const body = (await response.json()) as {
      ok?: boolean
      data?: { token?: string }
    }
    return body.ok ? (body.data?.token ?? null) : null
  }, [])

  return {
    isLoading: false,
    isAuthenticated: authenticated,
    fetchAccessToken,
  }
}
