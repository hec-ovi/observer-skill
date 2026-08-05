/**
 * YouTube's numbers, translated into ours. Both tables are numeric on purpose: the `YT`
 * namespace only exists once YouTube's script has run, and these run before that.
 */

import { playerError } from '../errors.ts'
import type { PlayerError, PlayerErrorCode, PlayerState } from '../../schema/player.ts'

const STATES = new Map<number, PlayerState>([
  [-1, 'unstarted'],
  [0, 'ended'],
  [1, 'playing'],
  [2, 'paused'],
  [3, 'buffering'],
  [5, 'cued'],
])

export function toPlayerState(raw: number): PlayerState {
  return STATES.get(raw) ?? 'unstarted'
}

const BAD_ID = 'YouTube does not recognise this video id. Paste the link again.'

const HTML5 =
  "YouTube's player refused this video. Reload the page, and pick another video if it " +
  'happens again.'

/** Code 153 is the one a 2026 page actually hits, and it needs its own words. */
const NO_REFERRER =
  'YouTube rejects embeds that arrive without a referrer. Open this page over http or ' +
  'https and leave the referrer policy at strict-origin-when-cross-origin; file:// pages, ' +
  'extension pages, and custom app schemes never send one.'

const ERRORS = new Map<number, { code: PlayerErrorCode; hint?: string }>([
  [2, { code: 'VIDEO_UNAVAILABLE', hint: BAD_ID }],
  [5, { code: 'PLAYER_UNAVAILABLE', hint: HTML5 }],
  [100, { code: 'VIDEO_UNAVAILABLE' }],
  [101, { code: 'NOT_EMBEDDABLE' }],
  [150, { code: 'NOT_EMBEDDABLE' }],
  [153, { code: 'NOT_EMBEDDABLE', hint: NO_REFERRER }],
])

export function toPlayerError(raw: number): PlayerError {
  const known = ERRORS.get(raw)
  return playerError(known?.code ?? 'PLAYER_UNAVAILABLE', known?.hint)
}
