/**
 * Two ways a hold can fail out loud, and one way it fails quietly.
 *
 * `ListenError` is thrown: a config that cannot be run at all, and a microphone the user
 * refused. `EngineFailure` never leaves the box: providers reject with it, the listener turns
 * it into the state and the reason a caller reads off the listener.
 */

export const LISTEN_ERROR_CODES = ['INVALID_LISTENING_CONFIG', 'MIC_DENIED'] as const

export type ListenErrorCode = (typeof LISTEN_ERROR_CODES)[number]

export class ListenError extends Error {
  readonly code: ListenErrorCode

  constructor(code: ListenErrorCode, message: string) {
    super(message)
    this.name = 'ListenError'
    this.code = code
  }
}

/** Where a failed hold leaves the listener. `unavailable` means the engine is out for good. */
export type Settles = 'idle' | 'unavailable'

export class EngineFailure extends Error {
  readonly settles: Settles

  constructor(message: string, settles: Settles = 'idle') {
    super(message)
    this.name = 'EngineFailure'
    this.settles = settles
  }
}

/** Anything thrown, as the message a settings panel can show. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
