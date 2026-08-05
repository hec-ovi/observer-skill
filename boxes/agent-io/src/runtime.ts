/**
 * What every tool runs against: the boxes below, the waiters, and the transcription runs.
 * One instance per process, shared by every connection the server serves.
 */

import { fail } from '#errors'
import type { Session } from '#session'
import type { AgentIoDeps } from './ports.ts'
import { Transcriptions } from './transcription.ts'
import { Waiters } from './waiters.ts'

/** Where a session lives on the listener. One shape, so the two callers cannot disagree. */
export function pageUrlFor(base: string, sessionId: string): string {
  return `${base}/s/${sessionId}`
}

export class Runtime {
  readonly deps: AgentIoDeps
  readonly waiters = new Waiters()
  readonly transcriptions: Transcriptions

  constructor(deps: AgentIoDeps) {
    this.deps = deps
    this.transcriptions = new Transcriptions(deps.store, deps.transcript, deps.config)
  }

  /** The session a call targets: the one it named, or the newest one in this process. */
  session(sessionId?: string): Session {
    if (sessionId !== undefined) return this.deps.store.get(sessionId)
    const newest = this.deps.store.list()[0]
    if (newest === undefined) {
      fail(
        'UNKNOWN_SESSION',
        'No session is open in this process.',
        'Open a video with `open` first.',
      )
    }
    return newest
  }

  /** The page for a session, once the listener is up. */
  pageUrl(sessionId: string): string | null {
    const base = this.deps.host.url
    return base === null ? null : pageUrlFor(base, sessionId)
  }

  close(): void {
    this.waiters.closeAll()
    this.transcriptions.close()
  }
}
