/**
 * The fake provider: the interface the app develops against, with no network and no frame.
 */

import { describe, expect, it, vi } from 'vitest'
import { POSITION_TICK_MS, createFakePlayer } from '../src/index.ts'
import { host, settle } from './settle.ts'
import type { PlayerError, PlayerState, Position, ReadyInfo } from '../src/index.ts'

interface Log {
  ready: ReadyInfo[]
  positions: Position[]
  states: PlayerState[]
  errors: PlayerError[]
}

function mount() {
  const log: Log = { ready: [], positions: [], states: [], errors: [] }
  const el = host()
  const player = createFakePlayer(el, {
    source: { provider: 'fake', videoId: 'fake-1', title: 'A talk', duration: 90 },
    onReady: (info) => log.ready.push(info),
    onPosition: (position) => log.positions.push(position),
    onState: (state) => log.states.push(state),
    onError: (error) => log.errors.push(error),
  })
  return { el, log, player }
}

describe('the fake player', () => {
  it('reports the duration and title it was given', async () => {
    const { log } = mount()
    await settle()

    expect(log.ready).toEqual([{ duration: 90, title: 'A talk' }])
    expect(log.states).toEqual(['cued'])
  })

  it('ticks while playing and stops when paused', async () => {
    vi.useFakeTimers()
    const { log, player } = mount()
    await settle()
    log.positions.length = 0

    player.play()
    vi.advanceTimersByTime(POSITION_TICK_MS * 2)
    expect(log.states).toEqual(['cued', 'playing'])
    expect(log.positions).toEqual([
      { time: 0, state: 'playing' },
      { time: 0.25, state: 'playing' },
      { time: 0.5, state: 'playing' },
    ])
    expect(player.time()).toBe(0.5)

    player.pause()
    vi.advanceTimersByTime(POSITION_TICK_MS * 8)
    expect(log.positions.at(-1)).toEqual({ time: 0.5, state: 'paused' })
    expect(log.positions).toHaveLength(4)
  })

  it('reports a seek as a position jump', async () => {
    const { log, player } = mount()
    await settle()
    log.positions.length = 0

    player.seek(42)

    expect(log.positions).toEqual([{ time: 42, state: 'cued' }])
    expect(log.states).toEqual(['cued'])
    expect(player.time()).toBe(42)
  })

  it('ends when the clock reaches the duration', async () => {
    const { log, player } = mount()
    await settle()

    player.advance(200)

    expect(player.state()).toBe('ended')
    expect(log.states.at(-1)).toBe('ended')
    expect(log.positions.at(-1)).toEqual({ time: 90, state: 'ended' })
  })

  it('reports the failure it is told to', async () => {
    const { log, player } = mount()
    await settle()

    player.fail('NOT_EMBEDDABLE')

    expect(log.errors.map((error) => error.code)).toEqual(['NOT_EMBEDDABLE'])
    expect(log.errors[0]?.hint).not.toBe('')
  })

  it('leaves nothing behind when destroyed', async () => {
    vi.useFakeTimers()
    const { el, log, player } = mount()
    await settle()
    player.play()
    const reported = log.positions.length

    player.destroy()

    expect(el.childNodes).toHaveLength(0)
    vi.advanceTimersByTime(POSITION_TICK_MS * 10)
    expect(log.positions).toHaveLength(reported)
  })
})
