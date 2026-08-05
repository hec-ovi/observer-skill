/**
 * The four ways an artifact can fail, and the one line the user is shown when it does.
 *
 * The technical text goes upstream to the agent. The user gets a sentence and a way back.
 */

export type StageErrorCode =
  | 'ARTIFACT_LOAD_FAILED'
  | 'ARTIFACT_MOUNT_FAILED'
  | 'ARTIFACT_TIMEOUT'
  | 'REGISTRY_MISSING'

export class StageError extends Error {
  readonly code: StageErrorCode

  constructor(code: StageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'StageError'
    this.code = code
  }
}

const LINES: Record<StageErrorCode, string> = {
  ARTIFACT_LOAD_FAILED: 'This visual could not be loaded.',
  ARTIFACT_MOUNT_FAILED: 'This visual could not be drawn.',
  ARTIFACT_TIMEOUT: 'This visual took too long to draw.',
  REGISTRY_MISSING: 'This page is missing the chart libraries this visual needs.',
}

/** What the stage prints when an artifact fails. Never a stack trace. */
export function stageErrorLine(code: StageErrorCode): string {
  return LINES[code]
}

/** Any thrown value as text for the agent: the stack when there is one, the message otherwise. */
export function describeError(value: unknown): string {
  if (!(value instanceof Error)) return String(value)
  // V8 stacks already open with "Name: message"; other engines' do not.
  return value.stack ?? `${value.name}: ${value.message}`
}
