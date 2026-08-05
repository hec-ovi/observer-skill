/**
 * The one place `VOICE_UNAVAILABLE` is built, so it reads the same whether the failure arrives
 * while a voice is loading or while a line is being spoken.
 */

import { VoiceOutError } from '../schema/voice-out.ts'

const HINT = 'Pick another voice in settings, or check the endpoint URL and key.'

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

export function unavailable(what: string, cause: unknown): VoiceOutError {
  return new VoiceOutError('VOICE_UNAVAILABLE', `${what}: ${describe(cause)}`, HINT)
}
