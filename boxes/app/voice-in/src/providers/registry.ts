/**
 * Every engine, in the order `auto` tries them: a configured endpoint beats the browser's
 * recognizer, which beats a model download. A named provider is used only if it can run.
 */

import type { ResolvedConfig } from '../config.ts'
import { endpointProvider } from './endpoint.ts'
import type { Provider } from './provider.ts'
import { webSpeechProvider } from './web-speech.ts'
import { whisperWebProvider } from './whisper-web.ts'

export const PROVIDERS: readonly Provider[] = [
  endpointProvider,
  webSpeechProvider,
  whisperWebProvider,
]

export function pickProvider(config: ResolvedConfig): Provider | null {
  if (config.provider === 'auto') {
    return PROVIDERS.find((provider) => provider.available(config)) ?? null
  }
  const named = PROVIDERS.find((provider) => provider.id === config.provider)
  return named?.available(config) ? named : null
}
