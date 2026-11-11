import { createWebPushClient } from "@workspace/pwa/client"

import { apiFetch } from "@/lib/api-client"

export const webPushClient = createWebPushClient({
  request: apiFetch,
})
