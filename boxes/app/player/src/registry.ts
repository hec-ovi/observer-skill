/**
 * Every provider this box knows, in the order they are asked. Adding one is a file beside
 * these and a line here; nothing outside the box changes.
 */

import { fakeProvider } from './fake.ts'
import { youtubeProvider } from './youtube/provider.ts'
import type { PlayerProvider } from '../schema/player.ts'

export const providers: readonly PlayerProvider[] = [youtubeProvider, fakeProvider]
