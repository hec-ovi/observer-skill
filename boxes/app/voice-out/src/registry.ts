/**
 * The three providers, and the one place a config turns into one of them.
 *
 * A config that names nothing runnable is `INVALID_VOICE_CONFIG` and throws here, before any
 * line starts. A provider that turns out not to run on this machine is a different thing: it
 * falls back, and only reports `VOICE_UNAVAILABLE` when nothing can make a sound.
 */

import { VoiceOutError } from '../schema/voice-out.ts'
import type { ProviderId, VoiceOutConfig } from '../schema/voice-out.ts'
import { endpointProvider } from './providers/endpoint.ts'
import { pocketProvider } from './providers/pocket.ts'
import type { VoiceProvider } from './providers/provider.ts'
import { webSpeechProvider } from './providers/web-speech.ts'

export const PROVIDERS: Record<ProviderId, VoiceProvider> = {
  'web-speech': webSpeechProvider,
  pocket: pocketProvider,
  endpoint: endpointProvider,
}

/** The provider the config asks for, or a thrown reason it cannot be one. */
export function requireProvider(config: VoiceOutConfig): VoiceProvider {
  const provider = PROVIDERS[config.provider]
  if (!provider) {
    throw new VoiceOutError(
      'INVALID_VOICE_CONFIG',
      `there is no voice provider called ${String(config.provider)}`,
      'Use web-speech, pocket, or endpoint.',
    )
  }

  if (provider.id === 'endpoint') requireUrl(config.baseUrl)
  return provider
}

function requireUrl(baseUrl: string | undefined): void {
  if (!baseUrl) {
    throw new VoiceOutError(
      'INVALID_VOICE_CONFIG',
      'the endpoint voice needs a baseUrl',
      'Set the speech endpoint URL in settings, or pick another voice provider.',
    )
  }
  if (!isHttpUrl(baseUrl)) {
    throw new VoiceOutError(
      'INVALID_VOICE_CONFIG',
      `${baseUrl} is not an http URL`,
      'Give the endpoint as an absolute URL, for example http://127.0.0.1:8880.',
    )
  }
}

function isHttpUrl(baseUrl: string): boolean {
  try {
    const { protocol } = new URL(baseUrl)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
