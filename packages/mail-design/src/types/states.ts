export type AsyncStatus<TError = string> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; error: TError }

export type MailPaneStatus =
  | { status: "ready" }
  | { status: "loading"; label: string }
  | { status: "empty"; label: string }
  | { status: "error"; label: string; retryLabel?: string }
