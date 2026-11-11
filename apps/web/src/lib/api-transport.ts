// The website replaces this boundary with its local demo transport at build time.
// The mail application always uses the native HTTP client.
export function mailApiFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, init)
}
