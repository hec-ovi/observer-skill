/**
 * An OpenAI-shaped speech endpoint: `POST {baseUrl}/v1/audio/speech`, audio bytes back.
 *
 * The whole line is sent as `input`; no length parameter of any kind goes on the wire. The
 * key is a Bearer header and only when one is configured, and only to the configured host.
 * Decoded audio plays through the box's own graph, so the page gets a live analyser.
 */

import type { ProviderInfo, Voice } from '../../schema/voice-out.ts'
import type { SpeakRequest, VoiceProvider, WarmRequest } from './provider.ts'

/** Servers differ on their default container; mp3 is the one every browser can decode. */
const RESPONSE_FORMAT = 'mp3'

function speechUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/v1/audio/speech`
}

async function fetchAudio(text: string, request: SpeakRequest): Promise<ArrayBuffer> {
  const { config } = request
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`

  const body: Record<string, unknown> = { input: text, response_format: RESPONSE_FORMAT }
  if (config.model) body.model = config.model
  if (config.voice) body.voice = config.voice

  const response = await fetch(speechUrl(config.baseUrl ?? ''), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: request.signal,
  })
  if (!response.ok) throw new Error(`speech endpoint answered ${response.status}`)
  return response.arrayBuffer()
}

function play(buffer: AudioBuffer, request: SpeakRequest): Promise<void> {
  const context = request.audio.context()
  const { node, analyser } = request.audio.output()
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(node)

  return new Promise<void>((resolve) => {
    let settled = false
    const settle = (): void => {
      if (settled) return
      settled = true
      request.signal.removeEventListener('abort', cut)
      source.disconnect()
      resolve()
    }
    const cut = (): void => {
      try {
        source.stop()
      } catch {
        // A source that never started, or already ended, is already silent.
      }
      settle()
    }

    source.addEventListener('ended', settle, { once: true })
    request.signal.addEventListener('abort', cut, { once: true })
    source.start()
    request.onStart(analyser)
  })
}

export const endpointProvider: VoiceProvider = {
  id: 'endpoint',

  async available(): Promise<boolean> {
    return typeof fetch === 'function' && typeof AudioContext !== 'undefined'
  },

  /** Nothing downloads; the latency worth removing is opening and resuming the context. */
  async warm(request: WarmRequest): Promise<void> {
    await request.audio.resume()
  },

  /** The server owns its voice names, so the panel takes one as free text. */
  async voices(): Promise<Voice[]> {
    return []
  },

  info(): ProviderInfo {
    return { id: 'endpoint', downloadBytes: 0, attribution: '' }
  },

  async speak(text: string, request: SpeakRequest): Promise<void> {
    const bytes = await fetchAudio(text, request)
    if (request.signal.aborted) return

    await request.audio.resume()
    const buffer = await request.audio.context().decodeAudioData(bytes)
    if (request.signal.aborted) return

    await play(buffer, request)
  },
}
