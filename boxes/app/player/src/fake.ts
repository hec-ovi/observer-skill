/**
 * A video that needs no network: the same interface, driven from a test or a dev harness.
 * It keeps its own clock, advances it while playing, and reports what a real provider
 * reports at the same moments.
 */

import { playerError } from './errors.ts'
import { POSITION_TICK_MS } from '../schema/player.ts'
import type {
  Player,
  PlayerErrorCode,
  PlayerOptions,
  PlayerProvider,
  PlayerState,
} from '../schema/player.ts'

/** Ten minutes, when the source does not say how long the video is. */
const DEFAULT_DURATION_S = 600

export interface FakePlayer extends Player {
  /** Move the clock forward without waiting, as if that much video had played. */
  advance(seconds: number): void
  /** Report a failure of this kind. */
  fail(code: PlayerErrorCode): void
}

class Fake implements FakePlayer {
  #el: HTMLElement
  #options: PlayerOptions
  #state: PlayerState = 'unstarted'
  #time = 0
  #duration: number
  #timer: ReturnType<typeof setInterval> | null = null
  #gone = false

  constructor(el: HTMLElement, options: PlayerOptions) {
    this.#el = el
    this.#options = options
    this.#duration = options.source.duration ?? DEFAULT_DURATION_S

    const mount = document.createElement('div')
    mount.style.width = '100%'
    mount.style.height = '100%'
    el.append(mount)

    // A real player is ready a round trip later, and callers are written around that.
    queueMicrotask(() => {
      if (this.#gone) return
      this.#options.onReady?.({
        duration: this.#duration,
        title: this.#options.source.title ?? '',
      })
      this.#move('cued')
    })
  }

  // A destroyed player answers no command, the way a torn-down provider frame does not.
  play(): void {
    if (this.#gone) return
    this.#move('playing')
    this.#timer ??= setInterval(() => this.advance(POSITION_TICK_MS / 1000), POSITION_TICK_MS)
  }

  pause(): void {
    if (this.#gone) return
    this.#stop()
    this.#move('paused')
  }

  seek(seconds: number): void {
    if (this.#gone) return
    this.#time = Math.min(Math.max(seconds, 0), this.#duration)
    this.#report()
  }

  time(): number {
    return this.#time
  }

  state(): PlayerState {
    return this.#state
  }

  duration(): number {
    return this.#duration
  }

  advance(seconds: number): void {
    if (this.#gone) return
    this.#time = Math.min(this.#time + seconds, this.#duration)
    if (this.#time < this.#duration) {
      this.#report()
      return
    }
    this.#stop()
    this.#move('ended')
  }

  fail(code: PlayerErrorCode): void {
    if (this.#gone) return
    this.#options.onError?.(playerError(code))
  }

  destroy(): void {
    this.#gone = true
    this.#stop()
    this.#el.replaceChildren()
  }

  #move(state: PlayerState): void {
    if (state !== this.#state) {
      this.#state = state
      this.#options.onState?.(state)
    }
    this.#report()
  }

  #report(): void {
    this.#options.onPosition?.({ time: this.#time, state: this.#state })
  }

  #stop(): void {
    if (this.#timer === null) return
    clearInterval(this.#timer)
    this.#timer = null
  }
}

export function createFakePlayer(el: HTMLElement, options: PlayerOptions): FakePlayer {
  return new Fake(el, options)
}

export const fakeProvider: PlayerProvider = {
  id: 'fake',
  matches: (source) => source.provider === 'fake',
  create: createFakePlayer,
}
