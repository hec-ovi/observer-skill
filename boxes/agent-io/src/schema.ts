/**
 * The fragments every tool shares: the session it targets, the phase every result carries,
 * and the two units the video is measured in.
 */

import * as z from 'zod/v4'
import { PHASES } from '#session'

export const phaseSchema = z.enum(PHASES)

export const sessionIdInput = z
  .string()
  .min(1)
  .optional()
  .describe('The session to act on. Defaults to the newest session in this process.')

/** Seconds of video, as the player reports them. */
export const seconds = z.number().min(0)

/** What the player is doing, as the page reports it on every position event. */
export const playerState = z.enum(['idle', 'playing', 'paused', 'buffering', 'ended'])
