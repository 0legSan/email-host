// Embedding changes only the demo shell and initial route, never the mail UI.
export const embeddedDemo =
  new URLSearchParams(window.location.search).get("embed") === "1"
