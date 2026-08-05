/**
 * What travels on the live channel, in both directions. `web-host` defines both tables; this
 * is the page's half of them.
 */

import type { Phase, PlaybackState, Progress, SettingsPatch } from './record.ts'

export interface PhaseEvent {
  phase: Phase
  progress: Progress
}

/** An answer from the agent. The log entry itself arrives as a patch. */
export interface SayEvent {
  entryId: string
  text: string
  speak: boolean
  artifactId: string | null
}

export interface ShowEvent {
  artifactId: string
}

export interface VerifyEvent {
  requestId: string
  url: string
  timeoutMs: number
}

export type AskVia = 'text' | 'voice'

export type UpstreamEvent =
  | { type: 'position'; time: number; state: PlaybackState }
  | { type: 'ask'; text: string; at: number; via: AskVia }
  | { type: 'settings'; at: number; settings: SettingsPatch }
  | {
      type: 'verify-result'
      requestId: string
      ok: boolean
      errors: string[]
      size: { width: number; height: number }
      snapshot: string | null
    }
