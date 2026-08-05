/**
 * One source in, one player out. Which provider answers is decided here and nowhere else.
 */

import { playerError } from './errors.ts'
import { providers } from './registry.ts'
import type { Player, PlayerOptions } from '../schema/player.ts'

const NO_PROVIDER_HINT = 'Paste a YouTube link: it is the only kind of video this page can play.'

/** Stands in when no provider claims the source: safe to call, and it plays nothing. */
function silent(): Player {
  return {
    play() {},
    pause() {},
    seek() {},
    time: () => 0,
    state: () => 'unstarted',
    duration: () => 0,
    destroy() {},
  }
}

export function createPlayer(el: HTMLElement, options: PlayerOptions): Player {
  const provider = providers.find((candidate) => candidate.matches(options.source))
  if (provider) return provider.create(el, options)

  // Reported the way every other failure is, once the caller holds the player.
  queueMicrotask(() => {
    options.onError?.(playerError('PLAYER_UNAVAILABLE', NO_PROVIDER_HINT))
  })
  return silent()
}
