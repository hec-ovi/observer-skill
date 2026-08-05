/**
 * An OpenAI-compatible transcription server: one multipart POST per hold, the text back.
 *
 * The recording goes up as 16 kHz mono WAV, which every server on this route reads without
 * converting. `Content-Type` is left alone on purpose: setting it strips the multipart
 * boundary the browser generates.
 */

import type { Recording } from '../capture.ts'
import { EngineFailure, messageOf } from '../errors.ts'
import { encodeWav } from '../wav.ts'
import type { Hold, HoldOptions, Provider } from './provider.ts'

const PATH = '/v1/audio/transcriptions'
const FILENAME = 'audio.wav'
/** Servers that pin the model at launch ignore the field; the rest accept this name. */
const DEFAULT_MODEL = 'whisper-1'

/** `en-US` reaches the server as `en`, which is the only form the route takes. */
function isoLanguage(language: string): string {
  return (language.split('-')[0] ?? language).toLowerCase()
}

class EndpointHold implements Hold {
  #options: HoldOptions
  #aborter = new AbortController()

  constructor(options: HoldOptions) {
    this.#options = options
  }

  async finish(recording: Recording): Promise<string> {
    const { config, language } = this.#options
    const body = new FormData()
    body.append('file', encodeWav(recording.pcm, recording.sampleRate), FILENAME)
    body.append('model', config.model ?? DEFAULT_MODEL)
    body.append('response_format', 'json')
    body.append('temperature', '0')
    body.append('language', isoLanguage(language))

    let response: Response
    try {
      response = await fetch(`${config.baseUrl ?? ''}${PATH}`, {
        method: 'POST',
        headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : undefined,
        body,
        signal: this.#aborter.signal,
      })
    } catch (error) {
      throw new EngineFailure(messageOf(error))
    }

    if (!response.ok) throw new EngineFailure(`transcription ${response.status}`)

    const data = (await response.json()) as { text?: string }
    return (data.text ?? '').trim()
  }

  cancel(): void {
    this.#aborter.abort()
  }
}

export const endpointProvider: Provider = {
  id: 'endpoint',
  available: (config) => config.baseUrl !== null,
  listen: (options) => new EndpointHold(options),
}
