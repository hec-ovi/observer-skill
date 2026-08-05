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
type Settles = 'idle' | 'unavailable'

export class EngineFailure extends Error {
  readonly settles: Settles

  constructor(message: string, settles: Settles = 'idle') {
    super(message)
    this.name = 'EngineFailure'
    this.settles = settles
  }
}

/** A thrown value's fields. `NotAllowedError` and friends arrive as DOMException, which is
 * not an Error, so neither reader can lean on `instanceof`. */
function field(error: unknown, key: 'name' | 'message'): string {
  if (typeof error !== 'object' || error === null) return ''
  const value = (error as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

/** Anything thrown, as the message a settings panel can show. */
export function messageOf(error: unknown): string {
  return field(error, 'message') || field(error, 'name') || String(error)
}

/** Anything thrown, as the name a failure is classified by. */
export function nameOf(error: unknown): string {
  return field(error, 'name')
}
