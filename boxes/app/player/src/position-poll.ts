/**
 * Where the video is, on a tick.
 *
 * No provider offers a position event, so the poll is the only source of truth. It runs
 * while the video plays and stops when it does not, with one exception: a seek command
 * does not move the clock the caller reads, so after a seek the poll keeps going until the
 * clock itself has jumped. That jump is measured against how far the video could have
 * travelled on its own, never taken from a state event, which providers emit
 * inconsistently around a seek.
 */

import { POSITION_TICK_MS } from '../schema/player.ts'

/** One reading of a provider's clock. `time` is `null` while it has no answer yet. */
export interface Reading {
  time: number | null
  playing: boolean
  rate: number
}

/** Bigger than any drift or extrapolation a player does on its own. */
const SEEK_THRESHOLD_S = 0.75

/** How long a commanded seek is given to land before the last reading is reported anyway. */
const SETTLE_TICKS = 8

export class PositionPoll {
  #read: () => Reading
  #emit: (time: number) => void
  #timer: ReturnType<typeof setInterval> | null = null
  #lastTime = -1
  #lastWall = 0
  #settling = 0

  constructor(read: () => Reading, emit: (time: number) => void) {
    this.#read = read
    this.#emit = emit
  }

  /** The video moved on its own: report where it is, and tick only while it plays. */
  sync(): void {
    const reading = this.#read()
    if (reading.time === null) this.#lastTime = -1
    else {
      this.#mark(reading.time)
      this.#emit(reading.time)
    }
    if (reading.playing) this.#start()
    else if (this.#settling === 0) this.#clear()
  }

  /** A seek was asked for: tick until the clock lands on it. */
  expectSeek(): void {
    this.#settling = SETTLE_TICKS
    this.#start()
  }

  /** No more ticks. */
  stop(): void {
    this.#settling = 0
    this.#clear()
  }

  #tick(): void {
    const reading = this.#read()
    if (reading.time === null) {
      this.#lastTime = -1
      return
    }

    const jumped = this.#jumped(reading)
    this.#mark(reading.time)

    let settled = false
    if (this.#settling > 0) {
      this.#settling -= 1
      settled = jumped || this.#settling === 0
      if (settled) this.#settling = 0
    }

    if (reading.playing || jumped || settled) this.#emit(reading.time)
    if (!reading.playing && this.#settling === 0) this.#clear()
  }

  /** Further than playback could have carried it since the last reading. */
  #jumped(reading: Reading): boolean {
    if (this.#lastTime < 0 || reading.time === null) return false
    const travelled = reading.playing ? ((Date.now() - this.#lastWall) / 1000) * reading.rate : 0
    return Math.abs(reading.time - this.#lastTime - travelled) > SEEK_THRESHOLD_S
  }

  #mark(time: number): void {
    this.#lastTime = time
    this.#lastWall = Date.now()
  }

  #start(): void {
    this.#timer ??= setInterval(() => this.#tick(), POSITION_TICK_MS)
  }

  #clear(): void {
    if (this.#timer === null) return
    clearInterval(this.#timer)
    this.#timer = null
  }
}
