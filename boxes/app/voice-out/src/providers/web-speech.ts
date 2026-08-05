/**
 * `speechSynthesis`: the default, because it costs zero bytes and speaks immediately.
 *
 * The engine owns the audio, so there is no analyser to hand back. Voices arrive late on
 * first load in most browsers, which is the only thing `warm` waits for.
 */

import type { ProviderInfo, Voice } from '../../schema/voice-out.ts'
import type { SpeakRequest, VoiceProvider } from './provider.ts'

/** How long to wait for `voiceschanged` before accepting whatever the engine has. */
const VOICES_TIMEOUT_MS = 1500

function engine(): SpeechSynthesis | null {
  return typeof speechSynthesis === 'undefined' ? null : speechSynthesis
}

/** The engine's list, waiting once for the late delivery browsers do on first load. */
function listVoices(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const ready = synth.getVoices()
  if (ready.length > 0) return Promise.resolve(ready)

  return new Promise((resolve) => {
    const settle = (): void => {
      clearTimeout(timer)
      synth.removeEventListener('voiceschanged', settle)
      resolve(synth.getVoices())
    }
    const timer = setTimeout(settle, VOICES_TIMEOUT_MS)
    synth.addEventListener('voiceschanged', settle)
  })
}

/** The configured voice by URI or name, else the first one matching the language. */
function pickVoice(
  voices: SpeechSynthesisVoice[],
  wanted: string | undefined,
  language: string | undefined,
): SpeechSynthesisVoice | null {
  if (wanted) {
    const exact = voices.find((voice) => voice.voiceURI === wanted || voice.name === wanted)
    if (exact) return exact
  }
  if (language) {
    const tag = language.toLowerCase()
    const spoken = voices.find((voice) => voice.lang.toLowerCase().startsWith(tag.slice(0, 2)))
    if (spoken) return spoken
  }
  return null
}

export const webSpeechProvider: VoiceProvider = {
  id: 'web-speech',

  async available(): Promise<boolean> {
    return engine() !== null && typeof SpeechSynthesisUtterance !== 'undefined'
  },

  async warm(): Promise<void> {
    const synth = engine()
    if (synth) await listVoices(synth)
  },

  async voices(): Promise<Voice[]> {
    const synth = engine()
    if (!synth) return []
    const found = await listVoices(synth)
    return found.map((voice) => ({ id: voice.voiceURI, label: voice.name, lang: voice.lang }))
  },

  info(): ProviderInfo {
    return { id: 'web-speech', downloadBytes: 0, attribution: '' }
  },

  async speak(text: string, request: SpeakRequest): Promise<void> {
    const synth = engine()
    if (!synth) throw new Error('this browser has no speechSynthesis')

    const utterance = new SpeechSynthesisUtterance(text)
    if (request.language) utterance.lang = request.language
    const voice = pickVoice(await listVoices(synth), request.config.voice, request.language)
    if (voice) utterance.voice = voice

    if (request.signal.aborted) return

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const settle = (failure?: Error): void => {
        if (settled) return
        settled = true
        request.signal.removeEventListener('abort', cut)
        if (failure) reject(failure)
        else resolve()
      }
      const cut = (): void => {
        synth.cancel()
        settle()
      }

      utterance.addEventListener('start', () => request.onStart(null))
      utterance.addEventListener('boundary', (event) => request.onBoundary(event.charIndex))
      utterance.addEventListener('end', () => settle())
      utterance.addEventListener('error', () => settle(new Error('speechSynthesis failed')))
      request.signal.addEventListener('abort', cut, { once: true })

      synth.speak(utterance)
    })
  },
}
