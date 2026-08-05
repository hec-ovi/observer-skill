/**
 * Transcription runs behind `open`: the tool returns as soon as the page exists, and the
 * words arrive on their own. A failure lands on the session record, where `status` reads it.
 */

import { toErrorShape } from '#errors'
import type { Session, SessionStore } from '#session'
import { afterTranscribing } from './phases.ts'
import type { AgentIoConfig, TranscriptPort } from './ports.ts'
import { report } from './report.ts'

export class Transcriptions {
  readonly #store: SessionStore
  readonly #transcript: TranscriptPort
  readonly #config: AgentIoConfig
  /** Whether the words were machine-made, which only the fetch result knows. */
  readonly #generated = new Map<string, boolean>()
  #closed = false

  constructor(store: SessionStore, transcript: TranscriptPort, config: AgentIoConfig) {
    this.#store = store
    this.#transcript = transcript
    this.#config = config
  }

  /** Starts the run and returns. The caller never waits for it. */
  start(session: Session): void {
    void this.#run(session).catch(async (error: unknown) => {
      if (this.#closed) return
      report('transcript', error)
      await this.#store.fail(session.id, toErrorShape(error)).catch((failure: unknown) => {
        if (!this.#closed) report('transcript', failure)
      })
    })
  }

  /** True when the words are machine captions or speech recognition, so approximate. */
  generated(sessionId: string): boolean {
    return this.#generated.get(sessionId) ?? true
  }

  /**
   * The process is going away. A run still in flight has nowhere to write its result, so it
   * lands nothing and says nothing rather than reporting a store that is already gone.
   */
  close(): void {
    this.#closed = true
  }

  async #run(session: Session): Promise<void> {
    const ref = await this.#transcript.fetch(session.source, {
      home: this.#config.home,
      sessionId: session.id,
      provider: this.#config.transcript,
      onProgress: (progress) => {
        if (this.#closed) return
        void this.#store.progress(session.id, progress).catch((error: unknown) => {
          if (!this.#closed) report('transcript', error)
        })
      },
    })
    if (this.#closed) return

    this.#generated.set(session.id, ref.generated)
    await this.#store.patch(session.id, {
      transcript: {
        provider: ref.provider,
        language: ref.language,
        segmentCount: ref.segmentCount,
        duration: ref.duration,
      },
    })
    await this.#store.advance(session.id, afterTranscribing(session.settings))
  }
}
