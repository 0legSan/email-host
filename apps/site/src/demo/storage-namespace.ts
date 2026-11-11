// Mock mail and drafts must never read the real app's cache on the same origin.
// Theme and accent belong to mail-design and intentionally remain shared.
export function mailStorageKey(key: string) {
  return `email-host-demo:${key}`
}
