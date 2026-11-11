import { internal } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import type { MailAgentConvexClient } from "../convex/client"

export type MailWorkerAccount = {
  id: Id<"mailAccounts">
  provider: string
  address: string
  credentialVersion: number
  imapHost: string
}

type AccountListener = (accounts: readonly MailWorkerAccount[]) => void

export class MailAccountRegistry {
  private readonly convex: MailAgentConvexClient
  private readonly listeners = new Set<AccountListener>()
  private readonly readySignal = createSignal()
  private accounts: readonly MailWorkerAccount[] = []
  private unsubscribe: (() => void) | null = null
  private ready = false

  constructor(convex: MailAgentConvexClient) {
    this.convex = convex
  }

  start() {
    if (this.unsubscribe) return

    this.unsubscribe = this.convex.subscribe(
      internal.accountsInternal.listWorkerAccounts,
      {},
      (accounts) => {
        this.accounts = accounts
        if (!this.ready) {
          this.ready = true
          this.readySignal.resolve()
        }
        for (const listener of this.listeners) {
          listener(accounts)
        }
      },
      (error) => {
        console.error("Mail account subscription failed", error.message)
      }
    )
  }

  stop() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.readySignal.resolve()
  }

  whenReady() {
    return this.readySignal.promise
  }

  getAccounts() {
    return this.accounts
  }

  subscribe(listener: AccountListener) {
    this.listeners.add(listener)
    if (this.ready) listener(this.accounts)
    return () => this.listeners.delete(listener)
  }
}

function createSignal() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((signalResolve) => {
    resolve = signalResolve
  })
  return { promise, resolve }
}
