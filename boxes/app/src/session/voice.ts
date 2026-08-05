/** The session's settings, in the shape each voice box takes. */

import type { ListenConfig } from '@voice-in/index.ts'
import type { VoiceOutConfig } from '@voice-out/index.ts'
import type { Settings } from './record.ts'

export function voiceOutConfig(settings: Settings): VoiceOutConfig {
  const { provider, voice } = settings.voiceOut
  return voice ? { provider, voice } : { provider }
}

export function listenConfig(settings: Settings): ListenConfig {
  const { provider, endpoint } = settings.voiceIn
  return endpoint ? { provider, baseUrl: endpoint } : { provider }
}
