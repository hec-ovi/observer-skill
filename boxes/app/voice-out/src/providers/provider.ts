/**
 * The shape every provider fills. One file per provider, one line each in the registry.
 *
 * `speak` resolves when the line finished or was cut, and rejects when the provider could
 * not make a sound; the box turns a rejection into a fallback, never into a thrown error.
 */

import type {
  ProgressListener,
  ProviderId,
  ProviderInfo,
  Voice,
  VoiceOutConfig,
} from '../../schema/voice-out.ts'
import type { AudioHub } from '../audio.ts'

/** What the box hands a provider for one line. */
export interface SpeakRequest {
  config: VoiceOutConfig
  language: string | undefined
  audio: AudioHub
  /** Audio is out of the speaker now. `null` where the provider owns playback itself. */
  onStart: (analyser: AnalyserNode | null) => void
  onBoundary: (charIndex: number) => void
  /** Aborted when the line is cut. Providers stop making sound synchronously on it. */
  signal: AbortSignal
}

/** What the box hands a provider to prepare itself. */
export interface WarmRequest {
  config: VoiceOutConfig
  audio: AudioHub
  onProgress: ProgressListener
}

export interface VoiceProvider {
  readonly id: ProviderId
  /** Whether this browser, and this config, can make a sound through this provider. */
  available(config: VoiceOutConfig): Promise<boolean>
  /** Download and compile whatever the first line would otherwise wait for. Repeatable. */
  warm(request: WarmRequest): Promise<void>
  speak(text: string, request: SpeakRequest): Promise<void>
  voices(config: VoiceOutConfig): Promise<Voice[]>
  info(): ProviderInfo
  /** Release anything long-lived. Only providers that hold something implement it. */
  dispose?(): void
}
