export type MailtoHandlerRegistrationOutcome =
  "requested" | "unsupported" | "failed"

type ProtocolHandlerNavigator = Pick<Navigator, "registerProtocolHandler">

export function canRegisterMailtoHandler(
  navigator: Partial<ProtocolHandlerNavigator>,
  secureContext: boolean
): navigator is ProtocolHandlerNavigator {
  return (
    secureContext && typeof navigator.registerProtocolHandler === "function"
  )
}

export function getMailtoHandlerUrl(origin: string) {
  return new URL("/mail?compose=new&mailto=%s", origin).toString()
}

export function registerMailtoHandler(
  navigator: Partial<ProtocolHandlerNavigator>,
  origin: string,
  secureContext: boolean
): MailtoHandlerRegistrationOutcome {
  if (!canRegisterMailtoHandler(navigator, secureContext)) {
    return "unsupported"
  }

  try {
    navigator.registerProtocolHandler("mailto", getMailtoHandlerUrl(origin))
    return "requested"
  } catch {
    return "failed"
  }
}
