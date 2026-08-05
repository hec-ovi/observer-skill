/**
 * The IFrame API script: loaded once per page, and a failure the user can read.
 *
 * These run with `YT` taken off the window, which is the state of a page that has not
 * loaded the script yet. The order matters: the failing load is what clears the way for
 * the second test to inject a script of its own.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeYTPlayer, YT_STATE, signalYouTubeReady } from '../../testing/fakes.ts'
import { createPlayer } from '../src/index.ts'
import { host, settle } from './settle.ts'
import type { PlayerError } from '../src/index.ts'

const SOURCE = { provider: 'youtube', videoId: 'abc12345678' }

function scripts(): HTMLScriptElement[] {
  return [...document.querySelectorAll<HTMLScriptElement>('script[src*="iframe_api"]')]
}

describe('the YouTube API script', () => {
  beforeEach(() => {
    vi.stubGlobal('YT', undefined)
  })

  it('is PLAYER_UNAVAILABLE when it will not load', async () => {
    const errors: PlayerError[] = []
    createPlayer(host(), { source: SOURCE, onError: (error) => errors.push(error) })

    scripts()[0]?.dispatchEvent(new Event('error'))
    await settle()

    expect(errors.map((error) => error.code)).toEqual(['PLAYER_UNAVAILABLE'])
    expect(errors[0]?.hint).not.toBe('')
    // The dead tag goes with it, so the next mount can try again.
    expect(scripts()).toHaveLength(0)
  })

  it('is fetched once for a mount that is torn down and made again', async () => {
    const first = createPlayer(host(), { source: SOURCE })
    first.destroy()
    const second = createPlayer(host(), { source: SOURCE })

    expect(scripts()).toHaveLength(1)

    vi.stubGlobal('YT', { Player: FakeYTPlayer, PlayerState: YT_STATE })
    signalYouTubeReady()
    await settle()

    expect(FakeYTPlayer.instances).toHaveLength(1)
    second.destroy()
  })
})
