/**
 * Which line is being spoken at a given second.
 *
 * The starts are copied into a typed array once, so a lookup never walks the transcript: a
 * playing video asks four times a second and the answer is the line it already had, the one
 * after it, or a binary search when the user has jumped somewhere else.
 */

import type { Segment } from './types.ts'

export class SegmentIndex {
  readonly count: number
  readonly #starts: Float64Array
  #cursor = 0

  constructor(segments: readonly Segment[]) {
    this.count = segments.length
    this.#starts = new Float64Array(this.count)
    for (let i = 0; i < this.count; i += 1) this.#starts[i] = segments[i]?.start ?? 0
  }

  /**
   * The last line that had started by `time`, or `-1` when there are none. A second inside a
   * gap belongs to the line before it, which is the one still on screen.
   */
  indexAt(time: number): number {
    if (this.count === 0) return -1
    const cursor = this.#cursor
    if (time >= this.#startAt(cursor)) {
      if (time < this.#startAt(cursor + 1)) return cursor
      if (time < this.#startAt(cursor + 2)) {
        this.#cursor = cursor + 1
        return cursor + 1
      }
    }
    const found = this.#search(time)
    this.#cursor = found
    return found
  }

  /** Past the end is `Infinity`, which is what makes the last line's bounds work out. */
  #startAt(i: number): number {
    const start = this.#starts[i]
    return start === undefined ? Number.POSITIVE_INFINITY : start
  }

  #search(time: number): number {
    let low = 0
    let high = this.count - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if (this.#startAt(middle) <= time) low = middle
      else high = middle - 1
    }
    return low
  }
}
