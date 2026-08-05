/**
 * The three things that can go wrong, in words a user can act on. A provider that knows
 * more about a failure passes its own hint; the rest of the copy stays here so the same
 * failure always reads the same way.
 */

import type { PlayerError, PlayerErrorCode } from '../schema/player.ts'

const COPY: Record<PlayerErrorCode, { message: string; hint: string }> = {
  PLAYER_UNAVAILABLE: {
    message: 'The video player could not start.',
    hint: 'Check the connection and reload the page. A content blocker can also stop the player script.',
  },
  NOT_EMBEDDABLE: {
    message: 'This video cannot be played inside another page.',
    hint: 'Pick another video: the owner turned embedding off, or it is restricted here.',
  },
  VIDEO_UNAVAILABLE: {
    message: 'This video is not available.',
    hint: 'Check the link. The video may be private or deleted, or the id may be wrong.',
  },
}

export function playerError(code: PlayerErrorCode, hint?: string): PlayerError {
  const copy = COPY[code]
  return { code, message: copy.message, hint: hint ?? copy.hint }
}
