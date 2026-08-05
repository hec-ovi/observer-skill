/**
 * Everything `voice-out` promises, as types. A caller reads this file and CONTRACT.md and
 * needs nothing else from the box.
 */

/** The three ways a line can be spoken. */
export type ProviderId = 'web-speech' | 'pocket' | 'endpoint'

export const PROVIDER_IDS = ['web-speech', 'pocket', 'endpoint'] as const

/** Read from settings. `baseUrl`, `model`, and `apiKey` belong to `endpoint`. */
export interface VoiceOutConfig {
  provider: ProviderId
  voice?: string
  baseUrl?: string
  model?: string
  apiKey?: string
}

/** One choice in the settings panel's voice list. */
export interface Voice {
  id: string
  label: string
  lang: string
}

/** Audio is out of the speaker. `analyser` is live where the box owns the graph. */
export interface SpeakStart {
  analyser: AnalyserNode | null
}

/** Where the engine reports word boundaries, so the page can follow along. */
export interface SpeakBoundary {
  charIndex: number
}

/** Finished, stopped, or failed. Delivered exactly once per line. */
export interface SpeakEnd {
  error?: VoiceOutError
}

export interface SpeakOptions {
  config: VoiceOutConfig
  language?: string
  onStart?: (event: SpeakStart) => void
  onBoundary?: (event: SpeakBoundary) => void
  onEnd?: (event: SpeakEnd) => void
  /** Stops the line from the outside, exactly like `Handle.stop`. */
  signal?: AbortSignal
}

/** `stop` reports the end once, whether or not the line had begun. */
export interface Handle {
  stop(): void
}

/** What `warm` is doing right now. `ready` is the last one, with `loaded === total`. */
export type WarmStep = 'runtime' | 'model' | 'voice' | 'ready'

export interface WarmProgress {
  step: WarmStep
  loaded: number
  total: number
}

export type ProgressListener = (progress: WarmProgress) => void

/** What a provider costs before it can speak, for the settings panel to show up front. */
export interface ProviderInfo {
  id: ProviderId
  /** One-time download in bytes. Zero when the provider downloads nothing. */
  downloadBytes: number
  /** Attribution the product must display while this provider is in use. Empty when none. */
  attribution: string
}

export type VoiceOutErrorCode = 'INVALID_VOICE_CONFIG' | 'VOICE_UNAVAILABLE'

/** The closed error set. Nothing else leaves this box. */
export class VoiceOutError extends Error {
  readonly code: VoiceOutErrorCode
  readonly hint: string

  constructor(code: VoiceOutErrorCode, message: string, hint: string) {
    super(message)
    this.name = 'VoiceOutError'
    this.code = code
    this.hint = hint
  }
}
