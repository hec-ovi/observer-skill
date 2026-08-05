/**
 * The video port: what a caller hands in, what it gets back, and what a provider must
 * implement. Nothing in here knows which service the video comes from.
 */

/** Where the video lives. `provider` picks the implementation; the rest is that provider's. */
export interface PlayerSource {
  provider: string
  videoId: string
  url?: string
  /** Known before the player loads, and used when the player's own metadata is late. */
  title?: string
  duration?: number
}

export type PlayerState = 'unstarted' | 'playing' | 'paused' | 'buffering' | 'ended' | 'cued'

/** Where the user is, and what the video is doing there. */
export interface Position {
  time: number
  state: PlayerState
}

export interface ReadyInfo {
  duration: number
  title: string
}

export type PlayerErrorCode = 'PLAYER_UNAVAILABLE' | 'NOT_EMBEDDABLE' | 'VIDEO_UNAVAILABLE'

export interface PlayerError {
  code: PlayerErrorCode
  message: string
  hint: string
}

export interface PlayerOptions {
  source: PlayerSource
  onReady?: (info: ReadyInfo) => void
  onPosition?: (position: Position) => void
  onState?: (state: PlayerState) => void
  onError?: (error: PlayerError) => void
}

export interface Player {
  play(): void
  pause(): void
  seek(seconds: number): void
  /** The truth about where the user is. Read from the player, never from a wall clock. */
  time(): number
  state(): PlayerState
  duration(): number
  destroy(): void
}

/** One file per provider, plus its line in the registry. */
export interface PlayerProvider {
  id: string
  matches(source: PlayerSource): boolean
  create(el: HTMLElement, options: PlayerOptions): Player
}

/**
 * How often a playing video reports its position, in milliseconds. Close enough that a
 * pause lands on the right sentence, far enough apart that nothing floods.
 */
export const POSITION_TICK_MS = 250
