/** Why a hold produced nothing, in words, and what one hold measured. */

import type { Diagnostic, ListenState } from '@voice-in/index.ts'

export function micProblem(state: ListenState, reason: string | null): string | null {
  if (state === 'denied') {
    return 'The microphone is blocked for this page. Allow it in the browser, then hold again.'
  }
  if (state === 'unavailable') {
    return reason ?? 'No speech engine can run in this browser.'
  }
  return reason
}

export function diagnosticLine(diagnostic: Diagnostic): string {
  const seconds = diagnostic.seconds.toFixed(1)
  const peak = diagnostic.peak.toFixed(2)
  return `${diagnostic.device}: ${seconds} s of audio, loudest sample ${peak}`
}
