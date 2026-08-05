/**
 * The video's title and duration.
 *
 * YouTube answers neither getter until the video itself has started, so what the source
 * already knows stands in and the player's own values are picked up at the next state it
 * reports. Every correction goes to the caller, because `onReady` has already fired by
 * then. Once both values come from the player there is nothing left to read.
 */

import type { PlayerSource, ReadyInfo } from '../../schema/player.ts'

export class ReadyMetadata {
  #duration: number
  #title: string
  #report: (info: ReadyInfo) => void
  #reported = false
  #hasDuration = false
  #hasTitle = false

  constructor(source: PlayerSource, report: (info: ReadyInfo) => void) {
    this.#duration = source.duration ?? 0
    this.#title = source.title ?? ''
    this.#report = report
  }

  get duration(): number {
    return this.#duration
  }

  /** Read the player, and report on the first read and on anything it corrected. */
  read(target: YT.Player | null): void {
    if (!target || (this.#hasDuration && this.#hasTitle)) return
    let corrected = false

    const seconds = target.getDuration?.()
    if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
      this.#hasDuration = true
      corrected ||= seconds !== this.#duration
      this.#duration = seconds
    }

    const title = target.getVideoData?.()?.title
    if (typeof title === 'string' && title !== '') {
      this.#hasTitle = true
      corrected ||= title !== this.#title
      this.#title = title
    }

    if (this.#reported && !corrected) return
    this.#reported = true
    this.#report({ duration: this.#duration, title: this.#title })
  }
}
