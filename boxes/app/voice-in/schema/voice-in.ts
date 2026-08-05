/**
 * The shape of a listener: what you configure, what you get back, and what it calls while a
 * hold is open. Nothing here knows what the words mean.
 */

/** Which engine to use. `auto` picks the first one this browser and config can run. */
export type ListenProvider = 'auto' | 'web-speech' | 'whisper-web' | 'endpoint'

/** The engine actually chosen. */
export type EngineId = Exclude<ListenProvider, 'auto'>

/**
 * `listening` is a hold in progress, `working` is a recording being transcribed, `denied` is
 * a refused microphone and is never retried, `unavailable` is a browser with no engine.
 */
export type ListenState = 'idle' | 'listening' | 'working' | 'denied' | 'unavailable'

export interface ListenConfig {
  provider: ListenProvider
  /** Engine model id. Each provider has its own default. */
  model?: string
  /** Origin of an OpenAI-compatible transcription server, required by `endpoint`. */
  baseUrl?: string
  /** Sent to `baseUrl` and nowhere else. */
  apiKey?: string
  /** Holds shorter than this are dropped. Default 0.6. */
  minSeconds?: number
  /** Holds whose peak amplitude is under this are dropped. Default 0.01. */
  minPeak?: number
  /** Overrides the pinned transformers.js build `whisper-web` imports at runtime. */
  moduleUrl?: string
}

/** What one hold measured, whether or not it produced words. */
export interface Diagnostic {
  /** The input device's label, as the browser reports it. */
  device: string
  /** Seconds of audio actually captured. */
  seconds: number
  /** Loudest sample in the hold, 0 to 1. */
  peak: number
}

export interface ListenerOptions {
  config: ListenConfig
  /** BCP-47 tag. Default `en-US`. */
  language?: string
  /** Live text while the sentence firms up, where the engine gives partials. */
  onPartial?: (text: string) => void
  /** Once per hold that passed the gate. Empty when the engine failed. */
  onUtterance?: (text: string) => void
  onState?: (state: ListenState) => void
  /** Once per hold, so the settings panel can say why a hold produced nothing. */
  onDiagnostic?: (diagnostic: Diagnostic) => void
}

export interface Listener {
  /** An engine was found and the microphone is reachable. */
  readonly supported: boolean
  readonly engine: EngineId | null
  readonly state: ListenState
  /**
   * Why the listener is where it is: `MIC_DENIED`, `NO_MICROPHONE`, `NO_PROVIDER`, or the
   * engine's own message. Null while nothing has gone wrong.
   */
  readonly reason: string | null
  /** Open a hold. Resolves once the microphone is live, or the hold has been refused. */
  start(): Promise<void>
  /** Close the hold. Idempotent. Resolves once the utterance has been delivered or dropped. */
  stop(): Promise<void>
  /** Takes effect on the next hold. */
  setLanguage(language: string): void
  dispose(): void
}
