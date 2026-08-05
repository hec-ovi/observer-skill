/**
 * Pocket TTS, running entirely in this browser: ONNX in a worker, PCM through an
 * AudioWorklet. No key, no server, nothing said leaves the machine.
 *
 * The price is a one-time download of 195,361,827 bytes (about 186 MiB): 178 MB of model
 * assets plus the ONNX Runtime wasm and SentencePiece. It is `POCKET_DOWNLOAD_BYTES`, and
 * `info()` hands it to the settings panel so the user sees the number before agreeing to it.
 * The Cache API keeps it, so a second session pays nothing.
 *
 * Everything heavy is behind a dynamic import: choosing another voice costs nothing.
 */

import type { ProviderInfo, Voice, VoiceOutConfig } from '../../schema/voice-out.ts'
import {
  POCKET_BASE_URL,
  POCKET_BUNDLE,
  POCKET_DEFAULT_VOICE,
  POCKET_DOWNLOAD_BYTES,
  POCKET_ORT_BASE_URL,
  POCKET_VOICES,
} from '../pocket/assets.ts'
import { POCKET_ATTRIBUTION } from '../pocket/attribution.ts'
import type { PocketHost, PocketOptions } from '../pocket/host.ts'
import { probePocket } from '../pocket/probe.ts'
import type { AudioHub } from '../audio.ts'
import type { SpeakRequest, VoiceProvider, WarmRequest } from './provider.ts'

let host: PocketHost | null = null

function options(config: VoiceOutConfig): PocketOptions {
  return {
    baseUrl: config.baseUrl ?? POCKET_BASE_URL,
    bundle: POCKET_BUNDLE,
    voice: voiceOf(config),
    ortBaseUrl: POCKET_ORT_BASE_URL,
  }
}

function voiceOf(config: VoiceOutConfig): string {
  const wanted = config.voice
  return wanted && POCKET_VOICES.some((voice) => voice.id === wanted) ? wanted : POCKET_DEFAULT_VOICE
}

async function open(audio: AudioHub): Promise<PocketHost> {
  if (!host) {
    const { PocketHost: Host } = await import('../pocket/host.ts')
    host = new Host(audio)
  }
  return host
}

export const pocketProvider: VoiceProvider = {
  id: 'pocket',

  async available(): Promise<boolean> {
    return (await probePocket()).level !== 'unsupported'
  },

  async warm(request: WarmRequest): Promise<void> {
    if (!(await pocketProvider.available(request.config))) return
    const ready = await open(request.audio)
    await ready.load(options(request.config), request.onProgress)
  },

  async voices(): Promise<Voice[]> {
    return [...POCKET_VOICES]
  },

  info(): ProviderInfo {
    return { id: 'pocket', downloadBytes: POCKET_DOWNLOAD_BYTES, attribution: POCKET_ATTRIBUTION }
  },

  async speak(text: string, request: SpeakRequest): Promise<void> {
    const ready = await open(request.audio)
    await ready.load(options(request.config), () => {})
    if (request.signal.aborted) return
    await ready.speak(text, voiceOf(request.config), request)
  },

  dispose(): void {
    host?.dispose()
    host = null
  },
}
