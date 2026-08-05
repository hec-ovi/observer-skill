/**
 * What a hold says when it produced no question. The listener's own reasons are codes; these
 * are the sentences the user reads.
 */

import type { ListenState } from '../../voice-in/schema/voice-in.ts'

const REASONS: Record<string, string> = {
  MIC_DENIED: 'The microphone is blocked.',
  NO_MICROPHONE: 'No microphone was found.',
  NO_PROVIDER: 'This browser has no speech engine.',
}

/** True when nothing here can make the microphone work, and settings holds the fix. */
export function isBlocked(state: ListenState): boolean {
  return state === 'denied' || state === 'unavailable'
}

/** Why a hold produced nothing, in one line. */
export function holdProblem(state: ListenState, reason: string | null): string {
  if (!isBlocked(state)) return 'Nothing was heard.'
  if (!reason) return 'Speech is not available here.'
  return REASONS[reason] ?? reason
}
