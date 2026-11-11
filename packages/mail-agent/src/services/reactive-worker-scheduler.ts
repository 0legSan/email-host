type ReactiveWorkerWakeState = {
  nextAttemptAt: number | null
  lockedAt: number | null
}

export class ReactiveWorkerScheduler {
  private readonly run: () => Promise<void>
  private readonly staleLockMs: number
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private rerun = false
  private stopped = false

  constructor(run: () => Promise<void>, staleLockMs: number) {
    this.run = run
    this.staleLockMs = staleLockMs
  }

  update(state: ReactiveWorkerWakeState) {
    if (this.stopped) return

    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    const deadlines = [
      state.nextAttemptAt,
      state.lockedAt === null ? null : state.lockedAt + this.staleLockMs,
    ].filter((deadline): deadline is number => deadline !== null)
    const deadline = deadlines.length > 0 ? Math.min(...deadlines) : null

    if (deadline === null || deadline <= Date.now()) {
      if (deadline !== null) this.trigger()
      return
    }

    this.timer = setTimeout(() => {
      this.timer = null
      this.trigger()
    }, deadline - Date.now())
    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref()
    }
  }

  stop() {
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private trigger() {
    if (this.stopped) return
    if (this.running) {
      this.rerun = true
      return
    }

    this.running = true
    void this.run().finally(() => {
      this.running = false
      if (this.rerun) {
        this.rerun = false
        this.trigger()
      }
    })
  }
}
