/**
 * YouTube in an iframe, wrapped so the rest of the app only sees `Player`.
 */

import { playerError } from '../errors.ts'
import { PositionPoll } from '../position-poll.ts'
import { loadYouTubeApi } from './api.ts'
import { toPlayerError, toPlayerState } from './mapping.ts'
import { ReadyMetadata } from './metadata.ts'
import type { Reading } from '../position-poll.ts'
import type {
  Player,
  PlayerOptions,
  PlayerProvider,
  PlayerState,
} from '../../schema/player.ts'

/**
 * An age wall, a regional block, or a sign-in prompt is painted inside the frame and
 * reported by nothing. A video still sitting in its first state this long after the user
 * pressed play is one of those.
 */
const SILENT_FAILURE_MS = 8000

const SILENT_FAILURE_HINT =
  'YouTube is showing its own message inside the frame. The video is usually age ' +
  'restricted, blocked in this country, or behind a sign-in. Pick another video.'

class YouTubePlayer implements Player {
  #el: HTMLElement
  #options: PlayerOptions
  #poll: PositionPoll
  #metadata: ReadyMetadata
  #yt: YT.Player | null = null
  #state: PlayerState = 'unstarted'
  #time = 0
  #watchdog: ReturnType<typeof setTimeout> | null = null
  #gone = false

  constructor(el: HTMLElement, options: PlayerOptions) {
    this.#el = el
    this.#options = options
    this.#metadata = new ReadyMetadata(options.source, (info) => options.onReady?.(info))
    this.#poll = new PositionPoll(
      () => this.#reading(),
      (time) => this.#report(time),
    )

    // The API replaces this node with its iframe. React never owns it, so a remount can
    // never collide with YouTube's DOM surgery.
    const mount = document.createElement('div')
    mount.style.width = '100%'
    mount.style.height = '100%'
    el.append(mount)

    loadYouTubeApi().then(
      (api) => {
        if (!this.#gone) this.#attach(api, mount)
      },
      () => {
        if (!this.#gone) this.#options.onError?.(playerError('PLAYER_UNAVAILABLE'))
      },
    )
  }

  play(): void {
    const yt = this.#yt
    if (!yt) return
    yt.playVideo()
    if (this.#state === 'unstarted' || this.#state === 'cued') this.#watch()
  }

  pause(): void {
    this.#yt?.pauseVideo()
  }

  seek(seconds: number): void {
    const yt = this.#yt
    if (!yt) return
    yt.seekTo(Math.max(seconds, 0), true)
    this.#poll.expectSeek()
  }

  time(): number {
    const seconds = this.#yt?.getCurrentTime?.()
    return typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : this.#time
  }

  state(): PlayerState {
    return this.#state
  }

  duration(): number {
    return this.#metadata.duration
  }

  destroy(): void {
    this.#gone = true
    this.#unwatch()
    this.#poll.stop()
    try {
      this.#yt?.destroy()
    } catch {
      // Already gone: the frame was taken out from under us.
    }
    this.#yt = null
    this.#el.replaceChildren()
  }

  #attach(api: typeof YT, mount: HTMLElement): void {
    this.#yt = new api.Player(mount, {
      width: '100%',
      height: '100%',
      videoId: this.#options.source.videoId,
      playerVars: {
        // No autoplay: playback starts from the user's gesture, never from the page.
        playsinline: 1,
        rel: 0,
        controls: 1,
        iv_load_policy: 3,
        cc_load_policy: 0,
      },
      events: {
        onReady: (event) => this.#ready(event.target),
        onStateChange: (event) => this.#moved(event.data),
        onError: (event) => this.#failed(event.data),
        onAutoplayBlocked: () => this.#blocked(),
      },
    })
  }

  #ready(target: YT.Player): void {
    this.#yt = target
    this.#metadata.read(target)
  }

  #moved(raw: number): void {
    // The video has moved, so the metadata the player withheld at load may be there now.
    this.#metadata.read(this.#yt)
    const next = toPlayerState(raw)
    if (next !== 'unstarted' && next !== 'cued') this.#unwatch()
    if (next !== this.#state) {
      this.#state = next
      this.#options.onState?.(next)
    }
    this.#poll.sync()
  }

  #failed(raw: number): void {
    this.#unwatch()
    this.#options.onError?.(toPlayerError(raw))
  }

  /** The browser refused a scripted play. Nothing is broken, and nothing is playing. */
  #blocked(): void {
    this.#unwatch()
    this.#poll.sync()
  }

  #reading(): Reading {
    const yt = this.#yt
    const seconds = yt?.getCurrentTime?.()
    const rate = yt?.getPlaybackRate?.()
    return {
      time: typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : null,
      playing: this.#state === 'playing',
      rate: typeof rate === 'number' && rate > 0 ? rate : 1,
    }
  }

  #report(time: number): void {
    this.#time = time
    this.#options.onPosition?.({ time, state: this.#state })
  }

  #watch(): void {
    this.#unwatch()
    this.#watchdog = setTimeout(() => {
      this.#watchdog = null
      this.#options.onError?.(playerError('NOT_EMBEDDABLE', SILENT_FAILURE_HINT))
    }, SILENT_FAILURE_MS)
  }

  #unwatch(): void {
    if (this.#watchdog === null) return
    clearTimeout(this.#watchdog)
    this.#watchdog = null
  }
}

export const youtubeProvider: PlayerProvider = {
  id: 'youtube-iframe',
  matches: (source) => source.provider === 'youtube',
  create: (el, options) => new YouTubePlayer(el, options),
}
