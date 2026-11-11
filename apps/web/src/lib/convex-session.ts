export const convexAuthEventName = "email-host:convex-auth"

export function setConvexSessionAuthenticated(authenticated: boolean) {
  window.dispatchEvent(
    new CustomEvent<boolean>(convexAuthEventName, {
      detail: authenticated,
    })
  )
}
