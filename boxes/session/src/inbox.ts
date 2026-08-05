import type { InboxEvent } from './schema.ts'

/** How long a `take` waits when nothing is pending and the caller named no timeout. */
const DEFAULT_TIMEOUT_MS = 30_000

export interface TakeOptions {
  /** The last cursor this caller consumed. Everything past it is delivered. */
  after?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface TakeResult {
  events: InboxEvent[]
  cursor: number
}

interface Waiter {
  after: number
  settle: (result: TakeResult) => void
}

/**
 * Ordered events with a monotonic cursor. A question asked while the agent was busy sits
 * here until it is taken, and a cursor that came back from a take never sees it twice.
 */
export class Inbox {
  readonly #events: InboxEvent[] = []
  readonly #waiters = new Set<Waiter>()

  push(event: InboxEvent): void {
    this.#events.push(event)
    for (const waiter of [...this.#waiters]) {
      const pending = this.#since(waiter.after)
      if (pending.length > 0) waiter.settle(this.#result(pending, waiter.after))
    }
  }

  take({ after = 0, timeoutMs = DEFAULT_TIMEOUT_MS, signal }: TakeOptions = {}): Promise<TakeResult> {
    const pending = this.#since(after)
    if (pending.length > 0) return Promise.resolve(this.#result(pending, after))
    if (signal?.aborted === true || timeoutMs <= 0) {
      return Promise.resolve({ events: [], cursor: after })
    }

    return new Promise<TakeResult>((resolve) => {
      let timer: NodeJS.Timeout | undefined
      let settled = false

      const settle = (result: TakeResult): void => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        this.#waiters.delete(waiter)
        resolve(result)
      }
      const onAbort = (): void => settle({ events: [], cursor: after })
      const waiter: Waiter = { after, settle }

      this.#waiters.add(waiter)
      timer = setTimeout(() => settle({ events: [], cursor: after }), timeoutMs)
      timer.unref()
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  /** Release every waiter with an empty result. Pending events stay where they are. */
  close(): void {
    for (const waiter of [...this.#waiters]) {
      waiter.settle({ events: [], cursor: waiter.after })
    }
  }

  #since(after: number): InboxEvent[] {
    return this.#events.filter((event) => event.cursor > after)
  }

  #result(events: InboxEvent[], after: number): TakeResult {
    return { events, cursor: events.at(-1)?.cursor ?? after }
  }
}
