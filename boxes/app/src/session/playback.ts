/**
 * The player's vocabulary, translated into the live channel's.
 *
 * The player knows `unstarted` and `cued`; the record keeps `idle`. Nothing else differs.
 */

import type { PlayerState } from '@player/index.ts'
import type { PlaybackState } from './record.ts'

const WIRE: Record<PlayerState, PlaybackState> = {
  unstarted: 'idle',
  cued: 'idle',
  playing: 'playing',
  paused: 'paused',
  buffering: 'buffering',
  ended: 'ended',
}

export function wireState(state: PlayerState): PlaybackState {
  return WIRE[state]
}
