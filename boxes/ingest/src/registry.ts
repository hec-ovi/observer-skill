/**
 * Every provider this box knows. Adding one is a file plus a line here; nothing outside
 * this box learns its name.
 */

import type { Source } from './schema.ts'
import { youtube } from './providers/youtube/provider.ts'

export interface Provider {
  id: string
  matches(url: string): boolean
  resolve(url: string, hasAds: boolean): Promise<Source>
}

const PROVIDERS: Provider[] = [youtube]

/** The provider that claims this URL, or null when none does. */
export function pickProvider(url: string): Provider | null {
  return PROVIDERS.find((provider) => provider.matches(url)) ?? null
}
