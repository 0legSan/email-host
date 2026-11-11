import { MailEngineError, type MailEngineErrorCode } from "./types"

export function normalizeMailEngineError(error: unknown): MailEngineError {
  if (error instanceof MailEngineError) {
    return error
  }

  const code = getMailEngineErrorCode(error)
  return new MailEngineError(code, getSafeErrorMessage(code), error)
}

export function getMailEngineErrorLogDetails(error: unknown) {
  const normalized =
    error instanceof MailEngineError ? error : normalizeMailEngineError(error)
  const cause = readErrorCause(normalized)

  return {
    code: normalized.code,
    message: normalized.message,
    causeCode: readErrorCode(cause),
    causeName: readErrorName(cause),
    causeMessage: readErrorMessage(cause),
    causeServerResponseCode: readStringProperty(cause, "serverResponseCode"),
    causeResponseStatus: readStringProperty(cause, "responseStatus"),
    causeResponseText: readStringProperty(cause, "responseText"),
    causeMailboxMissing: readOptionalBooleanProperty(cause, "mailboxMissing"),
  }
}

function getMailEngineErrorCode(error: unknown): MailEngineErrorCode {
  const errorCode = readErrorCode(error)

  if (
    errorCode === "EAUTH" ||
    readErrorName(error) === "AuthenticationFailure" ||
    readBooleanProperty(error, "authenticationFailed")
  ) {
    return "auth_error"
  }

  if (
    errorCode &&
    [
      "ECONNECTION",
      "ECONNREFUSED",
      "ECONNRESET",
      "EENVELOPE",
      "EHLO",
      "ENOTFOUND",
      "ESOCKET",
      "ETIMEDOUT",
      "ETLS",
      "GREETING_TIMEOUT",
      "LockTimeout",
    ].includes(errorCode)
  ) {
    return "connect_error"
  }

  return "provider_error"
}

function getSafeErrorMessage(code: MailEngineErrorCode) {
  switch (code) {
    case "auth_error":
      return "Mail provider authentication failed"
    case "connect_error":
      return "Mail provider connection failed"
    case "provider_error":
      return "Mail provider request failed"
  }
}

function readErrorName(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string"
  ) {
    return error.name
  }

  return null
}

function readErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code
  }

  return null
}

function readStringProperty(error: unknown, property: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    property in error &&
    typeof error[property as keyof typeof error] === "string"
  ) {
    return error[property as keyof typeof error]
  }

  return null
}

function readErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }

  return null
}

function readErrorCause(error: Error) {
  return (error as Error & { cause?: unknown }).cause
}

function readBooleanProperty(error: unknown, property: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    property in error &&
    typeof error[property as keyof typeof error] === "boolean"
  ) {
    return error[property as keyof typeof error]
  }

  return false
}

function readOptionalBooleanProperty(error: unknown, property: string) {
  if (
    typeof error === "object" &&
    error !== null &&
    property in error &&
    typeof error[property as keyof typeof error] === "boolean"
  ) {
    return error[property as keyof typeof error]
  }

  return null
}
