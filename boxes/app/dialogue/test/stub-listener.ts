/**
 * A `voice-in` listener as the contract describes one, driven from the test: it opens a hold,
 * reports what it hears, and delivers one utterance per hold, or none.
 */

import type { EngineId, Listener, ListenState } from '../../voice-in/schema/voice-in.ts'
import type { HoldHandlers, ListenerSource } from '../src/types.ts'

export class StubListener implements Listener {
  supported = true
  engine: EngineId | null = 'web-speech'
  state: ListenState = 'idle'
  reason: string | null = null

  /** test-side: what the next hold delivers. Null is a hold that produced nothing. */
  utterance: string | null = 'What is a tensor?'
  /** test-side: the microphone is refused when the next hold opens. */
  refuse = false
  disposed = false

  readonly #handlers: HoldHandlers

  constructor(handlers: HoldHandlers) {
    this.#handlers = handlers
  }

  async start(): Promise<void> {
    if (this.refuse) {
      this.#settle('denied', 'MIC_DENIED')
      return
    }
    this.#settle('listening', null)
  }

  async stop(): Promise<void> {
    if (this.state !== 'listening') return
    this.#settle('working', null)
    if (this.utterance !== null) this.#handlers.onUtterance(this.utterance)
    this.#settle('idle', null)
  }

  setLanguage(): void {}

  dispose(): void {
    this.disposed = true
  }

  /** test-side: what the engine has heard so far in this hold. */
  hears(text: string): void {
    this.#handlers.onPartial(text)
  }

  #settle(state: ListenState, reason: string | null): void {
    this.state = state
    this.reason = reason
    this.#handlers.onState(state)
  }
}

export interface StubListening {
  /** The prop the box takes. Stable, so a re-render never rebuilds the listener. */
  source: ListenerSource
  /** The listener the box created. */
  listener(): StubListener
}

export function stubListening(): StubListening {
  const made: StubListener[] = []
  return {
    source: (handlers) => {
      const listener = new StubListener(handlers)
      made.push(listener)
      return listener
    },
    listener: () => {
      const last = made.at(-1)
      if (!last) throw new Error('The box created no listener')
      return last
    },
  }
}
