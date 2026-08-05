/**
 * Which provider answers for a source.
 */

import { describe, expect, it } from 'vitest'
import { FakeYTPlayer } from '../../testing/fakes.ts'
import { createPlayer } from '../src/index.ts'
import { host, settle } from './settle.ts'
import type { PlayerError, ReadyInfo } from '../src/index.ts'

describe('createPlayer', () => {
  it('gives a YouTube source to the YouTube provider', async () => {
    createPlayer(host(), { source: { provider: 'youtube', videoId: 'abc12345678' } })
    await settle()

    expect(FakeYTPlayer.instances).toHaveLength(1)
    expect(FakeYTPlayer.last().config.videoId).toBe('abc12345678')
  })

  it('gives a fake source to the fake provider', async () => {
    const ready: ReadyInfo[] = []
    createPlayer(host(), {
      source: { provider: 'fake', videoId: 'fake-1', duration: 90 },
      onReady: (info) => ready.push(info),
    })
    await settle()

    expect(ready).toEqual([{ duration: 90, title: '' }])
    expect(FakeYTPlayer.instances).toHaveLength(0)
  })

  it('refuses a source no provider knows', async () => {
    const errors: PlayerError[] = []
    const player = createPlayer(host(), {
      source: { provider: 'vimeo', videoId: '123' },
      onError: (error) => errors.push(error),
    })
    await settle()

    expect(errors.map((error) => error.code)).toEqual(['PLAYER_UNAVAILABLE'])
    // Whatever the page does with the handle, it does not throw.
    player.play()
    player.seek(10)
    expect(player.time()).toBe(0)
    expect(player.state()).toBe('unstarted')
    player.destroy()
  })
})
