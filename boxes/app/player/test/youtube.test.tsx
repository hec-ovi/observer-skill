/**
 * The YouTube provider, driven through `createPlayer` with the fake IFrame API from the
 * app test harness.
 */

import { render } from '@testing-library/react'
import { StrictMode, useEffect, useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FakeYTPlayer, YT_STATE } from '../../testing/fakes.ts'
import { POSITION_TICK_MS, createPlayer } from '../src/index.ts'
import { host, settle } from './settle.ts'
import type { PlayerError, PlayerState, Position, ReadyInfo } from '../src/index.ts'

const SOURCE = { provider: 'youtube', videoId: 'abc12345678', title: 'A talk' }

interface Log {
  ready: ReadyInfo[]
  positions: Position[]
  states: PlayerState[]
  errors: PlayerError[]
}

function mount() {
  const log: Log = { ready: [], positions: [], states: [], errors: [] }
  const el = host()
  const player = createPlayer(el, {
    source: SOURCE,
    onReady: (info) => log.ready.push(info),
    onPosition: (position) => log.positions.push(position),
    onState: (state) => log.states.push(state),
    onError: (error) => log.errors.push(error),
  })
  return { el, log, player }
}

describe('the YouTube player', () => {
  it('reports its duration and title once it can be controlled', async () => {
    const { log } = mount()
    await settle()

    expect(log.ready).toEqual([{ duration: 300, title: 'A talk' }])
  })

  it('does not autoplay', async () => {
    const { log } = mount()
    await settle()
    const yt = FakeYTPlayer.last()

    expect(yt.config.playerVars?.autoplay).toBeUndefined()
    expect(yt.state).toBe(YT_STATE.UNSTARTED)
    expect(log.states).toEqual([])
  })

  it('reports a position on play, on every tick, and on pause', async () => {
    vi.useFakeTimers()
    const { log } = mount()
    await settle()
    const yt = FakeYTPlayer.last()

    yt.playVideo()
    expect(log.states).toEqual(['playing'])
    expect(log.positions).toEqual([{ time: 0, state: 'playing' }])

    yt.time = 0.25
    vi.advanceTimersByTime(POSITION_TICK_MS)
    yt.time = 0.5
    vi.advanceTimersByTime(POSITION_TICK_MS)
    expect(log.positions).toHaveLength(3)
    expect(log.positions.at(-1)).toEqual({ time: 0.5, state: 'playing' })

    yt.pauseVideo()
    expect(log.states).toEqual(['playing', 'paused'])
    expect(log.positions.at(-1)).toEqual({ time: 0.5, state: 'paused' })

    // The tick belongs to playback; a paused video is not polled.
    vi.advanceTimersByTime(POSITION_TICK_MS * 8)
    expect(log.positions).toHaveLength(4)
  })

  it('reports the end of the video', async () => {
    const { log } = mount()
    await settle()
    const yt = FakeYTPlayer.last()

    yt.time = 300
    yt.setState(YT_STATE.ENDED)

    expect(log.states).toEqual(['ended'])
    expect(log.positions).toEqual([{ time: 300, state: 'ended' }])
  })

  it('reports a seek when the player clock moves, not when the command is sent', async () => {
    vi.useFakeTimers()
    const { log, player } = mount()
    await settle()
    const yt = FakeYTPlayer.last()

    yt.setState(YT_STATE.PAUSED)
    expect(log.positions).toEqual([{ time: 0, state: 'paused' }])

    player.seek(42)
    yt.time = 0 // the command is in flight: the clock the page reads has not moved
    vi.advanceTimersByTime(POSITION_TICK_MS)
    expect(log.positions).toHaveLength(1)

    yt.time = 42 // the player answers
    vi.advanceTimersByTime(POSITION_TICK_MS)
    expect(log.positions.at(-1)).toEqual({ time: 42, state: 'paused' })

    // The jump landed, so the poll is done: nothing is playing.
    vi.advanceTimersByTime(POSITION_TICK_MS * 10)
    expect(log.positions).toHaveLength(2)
  })

  it('maps every failure code to a code and a hint', async () => {
    const { log } = mount()
    await settle()
    const yt = FakeYTPlayer.last()

    for (const code of [2, 5, 100, 101, 150, 153, 42]) yt.fail(code)

    expect(log.errors.map((error) => error.code)).toEqual([
      'VIDEO_UNAVAILABLE',
      'PLAYER_UNAVAILABLE',
      'VIDEO_UNAVAILABLE',
      'NOT_EMBEDDABLE',
      'NOT_EMBEDDABLE',
      'NOT_EMBEDDABLE',
      'PLAYER_UNAVAILABLE',
    ])
    expect(log.errors.every((error) => error.message !== '' && error.hint !== '')).toBe(true)
    expect(log.errors[5]?.hint).toMatch(/referrer/i)
  })

  it('reports a video that silently refuses to start', async () => {
    vi.useFakeTimers()
    const { log, player } = mount()
    await settle()
    const yt = FakeYTPlayer.last()
    // What an age wall or a regional block looks like: the frame paints, nothing answers.
    vi.spyOn(yt, 'playVideo').mockImplementation(() => {})

    player.play()
    vi.advanceTimersByTime(10_000)

    expect(log.errors.map((error) => error.code)).toEqual(['NOT_EMBEDDABLE'])
  })

  it('does not blame the video when the browser blocks the play', async () => {
    vi.useFakeTimers()
    const { log, player } = mount()
    await settle()
    const yt = FakeYTPlayer.last()
    vi.spyOn(yt, 'playVideo').mockImplementation(() => {})

    player.play()
    yt.config.events?.onAutoplayBlocked?.({ target: yt as unknown as YT.Player })
    vi.advanceTimersByTime(10_000)

    expect(log.errors).toEqual([])
    expect(log.positions.at(-1)).toEqual({ time: 0, state: 'unstarted' })
  })

  it('leaves nothing behind when destroyed', async () => {
    vi.useFakeTimers()
    const { el, log, player } = mount()
    await settle()
    const yt = FakeYTPlayer.last()
    yt.playVideo()
    const reported = log.positions.length

    player.destroy()

    expect(yt.destroyed).toBe(true)
    expect(el.childNodes).toHaveLength(0)
    vi.advanceTimersByTime(POSITION_TICK_MS * 10)
    expect(log.positions).toHaveLength(reported)
  })
})

function Mounted() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const player = createPlayer(el, { source: SOURCE })
    return () => player.destroy()
  }, [])
  return <div ref={ref} />
}

describe('mounting the player from React', () => {
  it('creates one player through a double invocation, and none after unmount', async () => {
    const view = render(
      <StrictMode>
        <Mounted />
      </StrictMode>,
    )
    await settle()

    expect(FakeYTPlayer.instances).toHaveLength(1)

    view.unmount()
    expect(FakeYTPlayer.live()).toHaveLength(0)
  })
})
