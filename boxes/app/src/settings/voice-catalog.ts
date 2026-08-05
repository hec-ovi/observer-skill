/**
 * What the panel can say about a voice before the user picks it.
 *
 * A provider that is not configured yet cannot be asked what it costs, and asking throws.
 * That is not an error to show: an unconfigured provider downloads nothing and credits
 * nobody until it is set up, which is exactly what the zeroes below say.
 */

import { providerInfo, voices } from '@voice-out/index.ts'
import type { ProviderInfo, Voice, VoiceOutConfig } from '@voice-out/index.ts'
import type { VoiceOutProvider } from '../session/record.ts'

export const VOICE_OUT_NAMES: Record<VoiceOutProvider, string> = {
  'web-speech': 'Browser voice',
  pocket: 'Pocket',
  endpoint: 'Endpoint',
}

export function costOf(provider: VoiceOutProvider): ProviderInfo {
  try {
    return providerInfo({ provider })
  } catch {
    return { id: provider, downloadBytes: 0, attribution: '' }
  }
}

export async function voicesOf(config: VoiceOutConfig): Promise<Voice[]> {
  try {
    return await voices(config)
  } catch {
    return []
  }
}

/** A download, in the unit a person agrees to. */
export function downloadSize(bytes: number): string {
  return `${Math.round(bytes / 1e6)} MB`
}
