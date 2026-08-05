/**
 * One waiter per session. A second `wait` on the same session supersedes the first, which
 * returns idle at once; no event is lost, because delivery is by cursor.
 */

export interface Waiter {
  /** Aborts when the call is cancelled or another `wait` takes the slot. */
  readonly signal: AbortSignal
  release(): void
}

export class Waiters {
  readonly #open = new Map<string, AbortController>()

  claim(sessionId: string, callSignal: AbortSignal): Waiter {
    this.#open.get(sessionId)?.abort()
    const own = new AbortController()
    this.#open.set(sessionId, own)
    return {
      signal: AbortSignal.any([callSignal, own.signal]),
      release: () => {
        if (this.#open.get(sessionId) === own) this.#open.delete(sessionId)
      },
    }
  }

  /** Releases everyone still blocked, so the process can shut down. */
  closeAll(): void {
    for (const controller of this.#open.values()) controller.abort()
    this.#open.clear()
  }
}
