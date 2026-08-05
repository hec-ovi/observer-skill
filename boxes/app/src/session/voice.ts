/** The session's settings, in the shape each voice box takes. */

import type { ListenConfig } from '@voice-in/index.ts'
import type { VoiceOutConfig } from '@voice-out/index.ts'
import type { Settings } from './record.ts'

export function voiceOutConfig({ provider, voice }: Settings['voiceOut']): VoiceOutConfig {
  return voice ? { provider, voice } : { provider }
}

export function listenConfig({ provider, endpoint }: Settings['voiceIn']): ListenConfig {
  return endpoint ? { provider, baseUrl: endpoint } : { provider }
}
