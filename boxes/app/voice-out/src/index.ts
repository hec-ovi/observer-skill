/**
 * voice-out: say one line out loud, through whichever voice the user picked.
 *
 * The whole box is these five calls and the types they take. See CONTRACT.md, and
 * `docs/pocket.md` for what the in-browser model downloads and where from.
 */

export { dispose, providerInfo, speak, voices, warm } from './voice-out.ts'

export { PROVIDER_IDS, VoiceOutError } from '../schema/voice-out.ts'
export type {
  Handle,
  ProgressListener,
  ProviderId,
  ProviderInfo,
  SpeakBoundary,
  SpeakEnd,
  SpeakOptions,
  SpeakStart,
  Voice,
  VoiceOutConfig,
  VoiceOutErrorCode,
  WarmProgress,
  WarmStep,
} from '../schema/voice-out.ts'
