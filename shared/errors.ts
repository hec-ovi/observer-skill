/**
 * The one closed error set. Every box throws these and nothing else; every hint names the
 * next legal action, because the reader is usually an agent that has to recover in one step.
 */

export const ERROR_CODES = [
  'BAD_SOURCE',
  'SOURCE_UNAVAILABLE',
  'SOURCE_NOT_EMBEDDABLE',
  'NO_TRANSCRIPT',
  'TRANSCRIPT_FAILED',
  'WRONG_PHASE',
  'ILLEGAL_PHASE',
  'UNKNOWN_SESSION',
  'UNKNOWN_CONCEPT',
  'UNKNOWN_ARTIFACT',
  'INVALID_CONCEPT',
  'RANGE_OUT_OF_BOUNDS',
  'INVALID_PATCH',
  'ARTIFACT_INVALID',
  'ARTIFACT_TOO_LARGE',
  'PAGE_NOT_OPEN',
  'PROVIDER_UNAVAILABLE',
  'STORE_UNWRITABLE',
  'INTERNAL',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export interface ErrorShape {
  code: ErrorCode
  message: string
  hint: string
}

/** The HTTP status each code answers with, when it surfaces on a route. */
const STATUS: Record<ErrorCode, number> = {
  BAD_SOURCE: 400,
  SOURCE_UNAVAILABLE: 404,
  SOURCE_NOT_EMBEDDABLE: 409,
  NO_TRANSCRIPT: 422,
  TRANSCRIPT_FAILED: 502,
  WRONG_PHASE: 409,
  ILLEGAL_PHASE: 409,
  UNKNOWN_SESSION: 404,
  UNKNOWN_CONCEPT: 404,
  UNKNOWN_ARTIFACT: 404,
  INVALID_CONCEPT: 400,
  RANGE_OUT_OF_BOUNDS: 400,
  INVALID_PATCH: 400,
  ARTIFACT_INVALID: 422,
  ARTIFACT_TOO_LARGE: 413,
  PAGE_NOT_OPEN: 409,
  PROVIDER_UNAVAILABLE: 503,
  STORE_UNWRITABLE: 500,
  INTERNAL: 500,
}

export class ObserverError extends Error {
  readonly code: ErrorCode
  readonly hint: string

  constructor(code: ErrorCode, message: string, hint: string) {
    super(message)
    this.name = 'ObserverError'
    this.code = code
    this.hint = hint
  }

  get status(): number {
    return STATUS[this.code]
  }

  toJSON(): ErrorShape {
    return { code: this.code, message: this.message, hint: this.hint }
  }
}

export function fail(code: ErrorCode, message: string, hint: string): never {
  throw new ObserverError(code, message, hint)
}

export function isObserverError(e: unknown): e is ObserverError {
  return e instanceof ObserverError
}

/** Anything at all, rendered as the shape a caller can act on. */
export function toErrorShape(e: unknown): ErrorShape {
  if (isObserverError(e)) return e.toJSON()
  const message = e instanceof Error ? e.message : String(e)
  return {
    code: 'INTERNAL',
    message,
    hint: 'Unexpected failure. Report it with this message.',
  }
}
