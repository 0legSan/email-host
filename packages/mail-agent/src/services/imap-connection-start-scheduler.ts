const defaultInitialIntervalMs = 60_000
const defaultMinIntervalMs = 40_000
const defaultMaxIntervalMs = 120_000
const defaultJitterMs = 3_000
const successThreshold = 4
const fastConnectionMs = 10_000

type ImapConnectionStartSchedulerOptions = {
  initialIntervalMs?: number
  minIntervalMs?: number
  maxIntervalMs?: number
}

type HostTimingState = {
  intervalMs: number
  nextStartAt: number
  successStreak: number
}

export class ImapConnectionStartScheduler {
  private readonly initialIntervalMs: number
  private readonly minIntervalMs: number
  private readonly maxIntervalMs: number
  private readonly states = new Map<string, HostTimingState>()

  constructor(options: ImapConnectionStartSchedulerOptions = {}) {
    this.minIntervalMs = Math.max(
      1_000,
      options.minIntervalMs ?? defaultMinIntervalMs
    )
    this.maxIntervalMs = Math.max(
      this.minIntervalMs,
      options.maxIntervalMs ?? defaultMaxIntervalMs
    )
    this.initialIntervalMs = clamp(
      options.initialIntervalMs ?? defaultInitialIntervalMs,
      this.minIntervalMs,
      this.maxIntervalMs
    )
  }

  reserveDelay(host: string) {
    const hostKey = normalizeImapHost(host)

    if (!isBegetImapHost(hostKey)) {
      return 0
    }

    const now = Date.now()
    const state = this.getState(hostKey)
    const startAt = Math.max(now, state.nextStartAt)
    const jitterMs = Math.floor(Math.random() * defaultJitterMs)

    state.nextStartAt = startAt + state.intervalMs + jitterMs

    return startAt - now
  }

  recordConnectionSuccess(host: string, durationMs: number) {
    const hostKey = normalizeImapHost(host)
    if (!isBegetImapHost(hostKey)) return

    const state = this.getState(hostKey)
    const previousIntervalMs = state.intervalMs
    if (state.intervalMs > this.initialIntervalMs) {
      state.intervalMs = Math.max(
        this.initialIntervalMs,
        state.intervalMs - 20_000
      )
      state.successStreak = 0
      this.logAdjustment(
        hostKey,
        previousIntervalMs,
        state.intervalMs,
        "cooldown_recovery"
      )
    } else {
      state.successStreak =
        durationMs <= fastConnectionMs ? state.successStreak + 1 : 0
    }

    if (state.successStreak >= successThreshold) {
      const stableIntervalMs = state.intervalMs
      state.intervalMs = Math.max(
        this.minIntervalMs,
        Math.floor((state.intervalMs * 2) / 3 / 1_000) * 1_000
      )
      state.successStreak = 0
      this.logAdjustment(
        hostKey,
        stableIntervalMs,
        state.intervalMs,
        "stable_connections"
      )
    }

    console.info("Beget IMAP connection timing", {
      host: hostKey,
      outcome: "success",
      durationMs,
      intervalMs: state.intervalMs,
      successStreak: state.successStreak,
    })
  }

  recordConnectionFailure(host: string, durationMs: number, error: unknown) {
    const hostKey = normalizeImapHost(host)
    if (!isBegetImapHost(hostKey)) return

    const state = this.getState(hostKey)
    const previousIntervalMs = state.intervalMs
    state.successStreak = 0
    state.intervalMs = Math.min(
      this.maxIntervalMs,
      Math.max(state.intervalMs + 5_000, state.intervalMs * 2)
    )
    state.nextStartAt = Math.max(
      state.nextStartAt,
      Date.now() + state.intervalMs
    )
    this.logAdjustment(
      hostKey,
      previousIntervalMs,
      state.intervalMs,
      "connection_failure"
    )
    console.warn("Beget IMAP connection timing", {
      host: hostKey,
      outcome: "failure",
      durationMs,
      intervalMs: state.intervalMs,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  private getState(hostKey: string) {
    let state = this.states.get(hostKey)
    if (!state) {
      state = {
        intervalMs: this.initialIntervalMs,
        nextStartAt: 0,
        successStreak: 0,
      }
      this.states.set(hostKey, state)
    }
    return state
  }

  private logAdjustment(
    host: string,
    previousIntervalMs: number,
    intervalMs: number,
    reason: string
  ) {
    if (previousIntervalMs === intervalMs) return
    console.info("Beget IMAP interval adjusted", {
      host,
      previousIntervalMs,
      intervalMs,
      reason,
    })
  }
}

export function isBegetImapHost(host: string) {
  const hostKey = normalizeImapHost(host)

  return hostKey === "imap.beget.com" || hostKey === "imap.beget.ru"
}

function normalizeImapHost(host: string) {
  return host.trim().toLowerCase()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
