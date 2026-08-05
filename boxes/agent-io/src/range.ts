/**
 * The stretch of video a visual is about. `build` and `link` both take one, and both read it
 * through here, so the two calls cannot disagree about what half a range means.
 */

import { fail } from '#errors'

export interface Range {
  startsAt: number
  endsAt: number
}

/**
 * Both bounds or neither. One alone is a mistake worth saying out loud: a link with no range
 * is offered across the whole concept, so silently dropping half of one widens what the user
 * sees instead of narrowing it.
 */
export function rangeOf(
  startsAt: number | undefined,
  endsAt: number | undefined,
): Range | undefined {
  if (startsAt === undefined && endsAt === undefined) return undefined
  if (startsAt === undefined || endsAt === undefined) {
    const missing = startsAt === undefined ? '`startsAt`' : '`endsAt`'
    fail(
      'INVALID_PATCH',
      'A range needs both `startsAt` and `endsAt`.',
      `Send ${missing} too, or neither, which leaves the visual on the concept's own range.`,
    )
  }
  return { startsAt, endsAt }
}
