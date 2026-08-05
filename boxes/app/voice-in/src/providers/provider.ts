/**
 * What every engine looks like from the listener's side: a name, an honest answer about
 * whether it can run here, and one hold at a time.
 *
 * A hold is opened on press so an engine that transcribes live has the whole utterance, and
 * finished on release with the recording the gate already accepted. A gated-out hold is
 * cancelled instead, which is what keeps silence from reaching a transcriber.
 */

import type { EngineId } from '../../schema/voice-in.ts'
import type { Recording } from '../capture.ts'
import type { ResolvedConfig } from '../config.ts'

export interface HoldOptions {
  config: ResolvedConfig
  language: string
  onPartial: (text: string) => void
}

export interface Hold {
  /** Release. Resolves with the utterance, rejects with `EngineFailure`. */
  finish(recording: Recording): Promise<string>
  /** Drop the hold: no utterance, no request. */
  cancel(): void
}

export interface Provider {
  readonly id: EngineId
  available(config: ResolvedConfig): boolean
  listen(options: HoldOptions): Hold
}
