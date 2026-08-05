/**
 * One waiter per session, and the cursor already handed to it. A second `wait` on the same
 * session supersedes the first, which returns idle at once; no event is lost, because
 * delivery is by cursor and the cursor is kept here.
 */

export interface Waiter {
  /** Aborts when the call is cancelled or another `wait` takes the slot. */
  readonly signal: AbortSignal
  release(): void
}

export class Waiters {
  readonly #open = new Map<string, AbortController>()
  readonly #delivered = new Map<string, number>()

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

  /** The last cursor this session's agent was given, so a call that names none resumes. */
  delivered(sessionId: string): number | undefined {
    return this.#delivered.get(sessionId)
  }

  deliver(sessionId: string, cursor: number): void {
    this.#delivered.set(sessionId, cursor)
  }

  /** Releases everyone still blocked, so the process can shut down. */
  closeAll(): void {
    for (const controller of this.#open.values()) controller.abort()
    this.#open.clear()
  }
}
