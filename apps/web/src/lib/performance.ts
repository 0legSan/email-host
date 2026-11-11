type PerformanceWindow = Window & {
  __emailHostPerf?: {
    mark: typeof markPerformance
    measure: typeof measurePerformance
    entries: typeof getPerformanceEntries
  }
}

const performancePrefix = "email-host"

function isPerformanceLoggingEnabled() {
  if (typeof window === "undefined") {
    return false
  }

  return (
    import.meta.env.DEV ||
    window.location.search.includes("perf=1") ||
    window.localStorage.getItem("email-host:perf") === "1"
  )
}

function performanceName(name: string) {
  return `${performancePrefix}:${name}`
}

export function markPerformance(name: string) {
  if (!isPerformanceLoggingEnabled()) {
    return
  }

  performance.mark(performanceName(name))
}

export function measurePerformance(
  name: string,
  startMark: string,
  endMark: string
) {
  if (!isPerformanceLoggingEnabled()) {
    return
  }

  try {
    const measureName = performanceName(name)

    performance.measure(
      measureName,
      performanceName(startMark),
      performanceName(endMark)
    )

    const [entry] = performance.getEntriesByName(measureName).slice(-1)

    if (entry) {
      console.debug(
        `[perf] ${name}: ${entry.duration.toFixed(1)}ms`,
        entry
      )
    }
  } catch {
    return
  }
}

export function getPerformanceEntries() {
  if (typeof performance === "undefined") {
    return []
  }

  return performance
    .getEntries()
    .filter((entry) => entry.name.startsWith(`${performancePrefix}:`))
}

if (typeof window !== "undefined") {
  ;(window as PerformanceWindow).__emailHostPerf = {
    mark: markPerformance,
    measure: measurePerformance,
    entries: getPerformanceEntries,
  }
}
