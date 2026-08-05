/**
 * One spoken line, from the moment it is asked for to the single `onEnd` that closes it.
 *
 * The line owns the fallback: if the chosen provider cannot run here, or fails before it
 * makes a sound, `web-speech` gets the same text. `VOICE_UNAVAILABLE` is only reported when
 * that fails too, which means the machine has no way to speak at all.
 */

import { VoiceOutError } from '../schema/voice-out.ts'
import type { SpeakOptions } from '../schema/voice-out.ts'
import type { AudioHub } from './audio.ts'
import type { SpeakRequest, VoiceProvider } from './providers/provider.ts'
import { PROVIDERS } from './registry.ts'

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  return String(cause)
}

export class Line {
  readonly #text: string
  readonly #options: SpeakOptions
  readonly #audio: AudioHub
  readonly #cutter = new AbortController()
  #started = false
  #ended = false

  constructor(text: string, options: SpeakOptions, audio: AudioHub) {
    this.#text = text
    this.#options = options
    this.#audio = audio
    if (options.signal?.aborted) this.cut()
    else options.signal?.addEventListener('abort', this.cut)
  }

  /** Stop making sound now, and report the end once. Safe at any point, including twice. */
  cut = (): void => {
    if (this.#ended) return
    this.#cutter.abort()
    this.#end()
  }

  async run(provider: VoiceProvider): Promise<void> {
    const failure = await this.#attempt(provider)
    if (failure === null || this.#cutter.signal.aborted) {
      this.#end()
      return
    }

    // Only a provider that never made a sound is worth retrying: repeating a line the user
    // already half heard is worse than ending it.
    const fallback = PROVIDERS['web-speech']
    if (provider.id !== fallback.id && !this.#started) {
      const second = await this.#attempt(fallback)
      if (second === null || this.#cutter.signal.aborted) {
        this.#end()
        return
      }
      this.#end(this.#unavailable(provider, second))
      return
    }

    this.#end(this.#unavailable(provider, failure))
  }

  /** `null` when the line was spoken, otherwise why it was not. */
  async #attempt(provider: VoiceProvider): Promise<unknown> {
    try {
      if (!(await provider.available(this.#options.config))) {
        return new Error(`${provider.id} cannot run in this browser`)
      }
      await provider.speak(this.#text, this.#request())
      return null
    } catch (error) {
      return error
    }
  }

  #request(): SpeakRequest {
    return {
      config: this.#options.config,
      language: this.#options.language,
      audio: this.#audio,
      onStart: (analyser) => {
        if (this.#started || this.#ended) return
        this.#started = true
        this.#options.onStart?.({ analyser })
      },
      onBoundary: (charIndex) => this.#options.onBoundary?.({ charIndex }),
      signal: this.#cutter.signal,
    }
  }

  #unavailable(provider: VoiceProvider, cause: unknown): VoiceOutError {
    return new VoiceOutError(
      'VOICE_UNAVAILABLE',
      `${provider.id} could not speak: ${describe(cause)}`,
      'Pick another voice in settings, or check the endpoint URL and key.',
    )
  }

  #end(error?: VoiceOutError): void {
    if (this.#ended) return
    this.#ended = true
    this.#options.signal?.removeEventListener('abort', this.cut)
    this.#options.onEnd?.(error ? { error } : {})
  }
}
