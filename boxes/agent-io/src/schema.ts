/**
 * The fragments every tool shares: the session it targets, the phase every result carries,
 * and the error shape a failed call comes back as.
 */

import * as z from 'zod/v4'
import { ERROR_CODES } from '#errors'
import { PHASES } from '#session'

export const phaseSchema = z.enum(PHASES)

export const sessionIdInput = z
  .string()
  .min(1)
  .optional()
  .describe('The session to act on. Defaults to the newest session in this process.')

export const errorSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string(),
  hint: z.string(),
})

/** Seconds of video, as the player reports them. */
export const seconds = z.number().min(0)
