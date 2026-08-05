/**
 * The player's own verdict on a video, read as one of four outcomes. The distinction that
 * matters: a video the viewer may not watch (region, age, privacy) is the video's problem
 * and the caller must hear about it; a challenge aimed at us is our problem, and the caller
 * keeps the video with fewer facts attached.
 */

import { PICK_ANOTHER } from '../../hints.ts'

export type Verdict =
  | { kind: 'playable' }
  | { kind: 'not-embeddable' }
  | { kind: 'unavailable'; message: string; hint: string }
  /** The lookup itself was turned away. Nothing was learned about the video. */
  | { kind: 'refused' }

export interface PlayabilitySignals {
  status: string | undefined
  reason: string | undefined
  embeddable: boolean | undefined
}

/** A challenge aimed at this client, not a statement about the video. */
const BOT_CHECK = /not a bot|unusual traffic|verify.{0,20}human/i

const AGE_STATUS = new Set([
  'AGE_VERIFICATION_REQUIRED',
  'AGE_CHECK_REQUIRED',
  'CONTENT_CHECK_REQUIRED',
])
const AGE_REASON = /confirm your age|age.?restrict|may be inappropriate/i
const REGION_REASON = /in your country|available in your|country.?restrict/i
const PRIVATE_REASON = /private video|this video is private/i

function unavailable(message: string, hint: string): Verdict {
  return { kind: 'unavailable', message, hint }
}

export function readPlayability(signals: PlayabilitySignals): Verdict {
  const status = signals.status ?? ''
  const reason = signals.reason ?? ''

  if (BOT_CHECK.test(reason)) return { kind: 'refused' }

  if (status === 'OK') {
    return signals.embeddable === false ? { kind: 'not-embeddable' } : { kind: 'playable' }
  }

  if (AGE_STATUS.has(status) || AGE_REASON.test(reason)) {
    return unavailable('This video is age restricted, so it will not play in an embed.', PICK_ANOTHER)
  }

  if (REGION_REASON.test(reason)) {
    return unavailable('This video is blocked in this region.', PICK_ANOTHER)
  }

  if (PRIVATE_REASON.test(reason) || status === 'LOGIN_REQUIRED') {
    return unavailable('This video needs an account to watch.', PICK_ANOTHER)
  }

  if (status === 'UNPLAYABLE' || status === 'ERROR') {
    return unavailable(reason === '' ? 'This video cannot be played.' : reason, PICK_ANOTHER)
  }

  // An outcome we have no rule for says nothing trustworthy about the video.
  return { kind: 'refused' }
}
