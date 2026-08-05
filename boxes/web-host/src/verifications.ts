import { randomUUID } from 'node:crypto'
import type { VerifyResult } from './schema.ts'

interface Pending {
  requestId: string
  artifactId: string
  finish: (result: VerifyResult) => void
  timer: NodeJS.Timeout
}

function failure(message: string): VerifyResult {
  return { ok: false, errors: [message], size: { width: 0, height: 0 }, snapshot: null }
}

/**
 * The verifications waiting on the page. One per artifact id: asking again supersedes the
 * older request rather than leaving two runs racing, and a request that is never answered
 * comes back as a failed verification instead of hanging the caller.
 */
export class Verifications {
  readonly #byRequest = new Map<string, Pending>()
  readonly #byArtifact = new Map<string, Pending>()

  start(artifactId: string, timeoutMs: number): { requestId: string; result: Promise<VerifyResult> } {
    const older = this.#byArtifact.get(artifactId)
    if (older !== undefined) {
      this.#settle(older, failure(`Superseded by a newer verification of ${artifactId}.`))
    }

    const requestId = randomUUID()
    const { promise, resolve } = Promise.withResolvers<VerifyResult>()
    const pending: Pending = {
      requestId,
      artifactId,
      finish: resolve,
      timer: setTimeout(() => {
        this.#settle(pending, failure(`The page did not answer within ${timeoutMs} ms.`))
      }, timeoutMs),
    }
    pending.timer.unref()

    this.#byRequest.set(requestId, pending)
    this.#byArtifact.set(artifactId, pending)
    return { requestId, result: promise }
  }

  /** True when the id matched something still waiting; a late answer is simply dropped. */
  settle(requestId: string, result: VerifyResult): boolean {
    const pending = this.#byRequest.get(requestId)
    if (pending === undefined) return false
    this.#settle(pending, result)
    return true
  }

  /** Nothing may be left waiting when the host goes down. */
  closeAll(): void {
    for (const pending of [...this.#byRequest.values()]) {
      this.#settle(pending, failure('The host closed before the page answered.'))
    }
  }

  #settle(pending: Pending, result: VerifyResult): void {
    clearTimeout(pending.timer)
    this.#byRequest.delete(pending.requestId)
    if (this.#byArtifact.get(pending.artifactId) === pending) {
      this.#byArtifact.delete(pending.artifactId)
    }
    pending.finish(result)
  }
}
