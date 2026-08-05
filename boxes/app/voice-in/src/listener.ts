/**
 * The hold: press, speak, release, one utterance.
 *
 * This file owns everything that is true whichever engine runs. It opens exactly one
 * microphone session per hold and lets go of it on release, it measures what was captured
 * before anything is transcribed, and it drops a hold that was too short or too quiet so a
 * transcriber is never handed silence to invent words from. The engine sees a hold only after
 * that gate.
 */

import type {
  Diagnostic,
  EngineId,
  Listener,
  ListenerOptions,
  ListenState,
} from '../schema/voice-in.ts'
import { microphoneReachable, openMicrophone, type MicCapture, type Recording } from './capture.ts'
import { DEFAULT_LANGUAGE, resolveConfig, type ResolvedConfig } from './config.ts'
import { EngineFailure, ListenError, messageOf } from './errors.ts'
import type { Hold, Provider } from './providers/provider.ts'
import { pickProvider } from './providers/registry.ts'

const NOTHING_CAPTURED: Diagnostic = { device: 'none', seconds: 0, peak: 0 }

class HoldListener implements Listener {
  #config: ResolvedConfig
  #language: string
  #provider: Provider | null = null

  #onPartial: (text: string) => void
  #onUtterance: (text: string) => void
  #onState: (state: ListenState) => void
  #onDiagnostic: (diagnostic: Diagnostic) => void

  #state: ListenState
  #reason: string | null = null
  #capture: MicCapture | null = null
  #hold: Hold | null = null
  #opening: Promise<void> = Promise.resolve()
  #disposed = false

  constructor(options: ListenerOptions) {
    this.#config = resolveConfig(options.config)
    this.#language = options.language ?? DEFAULT_LANGUAGE
    this.#onPartial = options.onPartial ?? (() => {})
    this.#onUtterance = options.onUtterance ?? (() => {})
    this.#onState = options.onState ?? (() => {})
    this.#onDiagnostic = options.onDiagnostic ?? (() => {})

    if (!microphoneReachable()) {
      this.#state = 'unavailable'
      this.#reason = 'NO_MICROPHONE'
      return
    }
    this.#provider = pickProvider(this.#config)
    this.#state = this.#provider ? 'idle' : 'unavailable'
    if (!this.#provider) this.#reason = 'NO_PROVIDER'
  }

  get supported(): boolean {
    return this.#provider !== null
  }

  get engine(): EngineId | null {
    return this.#provider?.id ?? null
  }

  get state(): ListenState {
    return this.#state
  }

  get reason(): string | null {
    return this.#reason
  }

  /** A press while the previous hold is still transcribing is ignored, as is a refused one. */
  start = (): Promise<void> => {
    const provider = this.#provider
    if (this.#disposed || !provider || this.#state !== 'idle') return Promise.resolve()
    this.#reason = null
    this.#setState('listening')
    this.#opening = this.#open(provider)
    return this.#opening
  }

  stop = async (): Promise<void> => {
    // A tap can release before the microphone is even live.
    await this.#opening
    const hold = this.#hold
    const capture = this.#capture
    if (this.#disposed || !hold || !capture || this.#state !== 'listening') return
    this.#hold = null
    this.#capture = null

    const recording = await capture.close()
    this.#emitDiagnostic(recording)

    if (recording.seconds < this.#config.minSeconds || recording.peak < this.#config.minPeak) {
      hold.cancel()
      this.#setState('idle')
      return
    }

    this.#setState('working')
    try {
      const text = await hold.finish(recording)
      this.#emitUtterance(text)
      this.#setState('idle')
    } catch (error) {
      this.#emitUtterance('')
      this.#fail(error)
    }
  }

  setLanguage = (language: string): void => {
    this.#language = language
  }

  dispose = (): void => {
    this.#disposed = true
    this.#hold?.cancel()
    this.#hold = null
    const capture = this.#capture
    this.#capture = null
    void capture?.close()
  }

  /**
   * The engine starts on the press, before the microphone is asked for, so an engine that
   * listens live hears the whole hold and Safari still sees the user's gesture.
   */
  async #open(provider: Provider): Promise<void> {
    const hold = provider.listen({
      config: this.#config,
      language: this.#language,
      onPartial: (text) => {
        if (!this.#disposed) this.#onPartial(text)
      },
    })
    this.#hold = hold

    try {
      this.#capture = await openMicrophone()
    } catch (error) {
      hold.cancel()
      this.#hold = null
      if (!this.#disposed) this.#onDiagnostic(NOTHING_CAPTURED)
      this.#fail(error)
    }
  }

  #fail(error: unknown): void {
    if (error instanceof ListenError && error.code === 'MIC_DENIED') {
      this.#reason = error.code
      this.#setState('denied')
      return
    }
    if (error instanceof EngineFailure) {
      this.#reason = error.message
      this.#setState(error.settles)
      return
    }
    this.#reason = messageOf(error)
    this.#setState('idle')
  }

  #emitDiagnostic(recording: Recording): void {
    if (this.#disposed) return
    this.#onDiagnostic({
      device: recording.device,
      seconds: recording.seconds,
      peak: recording.peak,
    })
  }

  #emitUtterance(text: string): void {
    if (this.#disposed) return
    this.#onUtterance(text.trim())
  }

  #setState(state: ListenState): void {
    if (this.#state === state) return
    this.#state = state
    if (!this.#disposed) this.#onState(state)
  }
}

/** Throws `INVALID_LISTENING_CONFIG` when the config cannot be run at all. */
export function createListener(options: ListenerOptions): Listener {
  return new HoldListener(options)
}
