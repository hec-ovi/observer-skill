/**
 * The box itself: one line at a time, one AudioContext, three providers behind one call.
 *
 * Starting a line cuts the one before it in the same tick, so a user who asks a new question
 * never hears the old answer trail off. Nothing here knows what a session, a concept, or a
 * chart is: the text arrives whole and is spoken whole.
 */

import type {
  Handle,
  ProgressListener,
  ProviderInfo,
  SpeakOptions,
  Voice,
  VoiceOutConfig,
} from '../schema/voice-out.ts'
import { AudioHub } from './audio.ts'
import { Line } from './line.ts'
import { PROVIDERS, requireProvider } from './registry.ts'

class VoiceOut {
  readonly #audio = new AudioHub()
  #line: Line | null = null

  speak = (text: string, options: SpeakOptions): Handle => {
    const provider = requireProvider(options.config)
    this.#line?.cut()

    const line = new Line(text, options, this.#audio)
    this.#line = line
    void line.run(provider)
    return { stop: line.cut }
  }

  warm = async (config: VoiceOutConfig, onProgress?: ProgressListener): Promise<void> => {
    const provider = requireProvider(config)
    await provider.warm({ config, audio: this.#audio, onProgress: onProgress ?? (() => {}) })
  }

  voices = async (config: VoiceOutConfig): Promise<Voice[]> => {
    return requireProvider(config).voices(config)
  }

  providerInfo = (config: VoiceOutConfig): ProviderInfo => {
    return requireProvider(config).info()
  }

  dispose = (): void => {
    this.#line?.cut()
    this.#line = null
    for (const provider of Object.values(PROVIDERS)) provider.dispose?.()
    this.#audio.close()
  }
}

const box = new VoiceOut()

/** Say one line. Starting another one stops this one. */
export const speak = box.speak

/** Prepare the provider so the first spoken line is not the slow one. Repeatable. */
export const warm = box.warm

/** What the settings panel offers as a voice, for the provider in this config. */
export const voices = box.voices

/** What this provider costs before it can speak, and what it must be credited with. */
export const providerInfo = box.providerInfo

/** Stop everything, release the worker and the AudioContext. */
export const dispose = box.dispose
