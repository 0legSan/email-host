import * as React from "react"
import { useRegisterSW } from "virtual:pwa-register/react"

type PwaUpdateOptions = {
  enabled: boolean
  checkIntervalMs?: number
  reloadTimeoutMs?: number
}

const pwaUpdateSearchParam = "__pwa_update"
let appReloadRequested = false

export function usePwaUpdate({
  enabled,
  checkIntervalMs = 60 * 60 * 1000,
  reloadTimeoutMs = 3_000,
}: PwaUpdateOptions) {
  const {
    needRefresh: [updateAvailable, setUpdateAvailable],
  } = useRegisterSW({ immediate: true, onNeedReload: () => undefined })
  const [updating, setUpdating] = React.useState(false)
  const serviceWorkerControllerRef = React.useRef<ServiceWorker | null>(null)

  React.useEffect(() => {
    if (!enabled || !canUseServiceWorkerRegistration()) {
      return
    }

    const check = async () => {
      try {
        const registration = await navigator.serviceWorker.ready
        await registration.update()
        if (registration.waiting || (await hasStaleAppShell())) {
          setUpdateAvailable(true)
        }
      } catch {
        return undefined
      }
    }
    void check()
    const intervalId = window.setInterval(() => void check(), checkIntervalMs)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void check()
      }
    }
    const handlePageShow = () => void check()

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handlePageShow)
    window.addEventListener("online", handlePageShow)
    window.addEventListener("pageshow", handlePageShow)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handlePageShow)
      window.removeEventListener("online", handlePageShow)
      window.removeEventListener("pageshow", handlePageShow)
    }
  }, [checkIntervalMs, enabled])

  React.useEffect(() => {
    if (!enabled || !canUseServiceWorkerRegistration()) {
      return
    }

    serviceWorkerControllerRef.current = navigator.serviceWorker.controller

    const reloadForChangedController = () => {
      const controller = navigator.serviceWorker.controller

      if (
        document.visibilityState !== "visible" ||
        controller === serviceWorkerControllerRef.current
      ) {
        return
      }

      serviceWorkerControllerRef.current = controller
      reloadApplication()
    }

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      reloadForChangedController
    )
    document.addEventListener("visibilitychange", reloadForChangedController)
    window.addEventListener("pageshow", reloadForChangedController)

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        reloadForChangedController
      )
      document.removeEventListener(
        "visibilitychange",
        reloadForChangedController
      )
      window.removeEventListener("pageshow", reloadForChangedController)
    }
  }, [enabled])

  const applyUpdate = React.useCallback(async () => {
    setUpdating(true)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const waitingWorker = registration?.waiting

      if (waitingWorker) {
        const activation = waitForServiceWorkerActivation(
          waitingWorker,
          reloadTimeoutMs
        )
        waitingWorker.postMessage({ type: "SKIP_WAITING" })
        await activation
      }

      reloadApplication()
    } finally {
      setUpdating(false)
    }
  }, [reloadTimeoutMs])

  return {
    applyUpdate,
    dismissUpdate: () => setUpdateAvailable(false),
    updateAvailable,
    updating,
  }
}

export async function checkForPwaUpdate() {
  if (!canUseServiceWorkerRegistration()) {
    return
  }

  try {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  } catch {
    return undefined
  }
}

export function cleanPwaUpdateUrl() {
  const url = new URL(window.location.href)

  if (!url.searchParams.has(pwaUpdateSearchParam)) {
    return
  }

  url.searchParams.delete(pwaUpdateSearchParam)
  window.history.replaceState(window.history.state, "", url)
}

function canUseServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    return false
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
  return location.protocol === "https:" || localHosts.has(location.hostname)
}

async function hasStaleAppShell() {
  const currentScript = document
    .querySelector<HTMLScriptElement>('script[type="module"][src]')
    ?.getAttribute("src")

  if (!currentScript) {
    return false
  }

  const response = await fetch("/index.html", { cache: "no-store" })

  if (!response.ok) {
    return false
  }

  const documentHtml = await response.text()
  const latestDocument = new DOMParser().parseFromString(
    documentHtml,
    "text/html"
  )
  const latestScript = latestDocument
    .querySelector<HTMLScriptElement>('script[type="module"][src]')
    ?.getAttribute("src")

  return Boolean(latestScript && latestScript !== currentScript)
}

function reloadApplication() {
  if (appReloadRequested) {
    return
  }

  appReloadRequested = true
  const url = new URL(window.location.href)
  url.searchParams.set(pwaUpdateSearchParam, Date.now().toString(36))
  window.location.replace(url)
  window.setTimeout(() => {
    appReloadRequested = false
  }, 3_000)
}

function waitForServiceWorkerActivation(
  worker: ServiceWorker,
  timeoutMs: number
) {
  if (!("serviceWorker" in navigator)) {
    return Promise.resolve(false)
  }

  return new Promise<boolean>((resolve) => {
    let timeoutId: number | null = null
    const finish = (activated: boolean) => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      )
      worker.removeEventListener("statechange", handleStateChange)
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      resolve(activated)
    }
    const handleControllerChange = () => finish(true)
    const handleStateChange = () => {
      if (worker.state === "activated") {
        finish(true)
      }
    }

    timeoutId = window.setTimeout(() => finish(false), timeoutMs)
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
      { once: true }
    )
    worker.addEventListener("statechange", handleStateChange)
  })
}
