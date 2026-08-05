/**
 * What the three surfaces are handed and what they emit.
 *
 * Nothing here knows about a session, a microphone, or an artifact beyond its id: the app
 * binds `voice-in` to its settings and hands the result in, and ids go back out untouched.
 */

import type { Listener, ListenState } from '../../voice-in/schema/voice-in.ts'

/** One timed line of the transcript, as `transcript` produces it. */
export interface Segment {
  i: number
  start: number
  end: number
  text: string
}

/** Where the video is. The rail follows `time`, and `playing` is what resumes following. */
export interface RailPosition {
  time: number
  /** The player's own state. `playing` is the only value this box reads. */
  state: string
}

export type AskVia = 'text' | 'voice'

export interface AskEvent {
  text: string
  /** The player's second when the user started asking, not when the question was sent. */
  at: number
  via: AskVia
}

/** What a hold reports while it is open, handed to `voice-in`'s `createListener` by the app. */
export interface HoldHandlers {
  onPartial(text: string): void
  onUtterance(text: string): void
  onState(state: ListenState): void
}

/**
 * `voice-in`'s `createListener`, already bound to the app's config and language. The box
 * calls it once per mount and disposes what it gets back, so it owns no microphone code.
 */
export type ListenerSource = (handlers: HoldHandlers) => Listener

/** One line of the log, in the shape the session record keeps it. */
export interface LogEntry {
  id: string
  role: 'user' | 'agent'
  text: string
  /** The player's second the question was asked at. */
  at: number
  /** The visual that came with this answer, when there was one. */
  artifactId?: string | null
  /** True when this answer was spoken, so it can be heard again. */
  spoken?: boolean
}

export interface TranscriptRailProps {
  /** The whole transcript, once. The rail never asks for more as the video plays. */
  segments: readonly Segment[]
  position: RailPosition
  onSeek(seconds: number): void
}

export interface AskBoxProps {
  /** The player's second, read the moment the user starts typing or holding. */
  at(): number
  listener: ListenerSource
  /** True when no agent is attached: the draft survives, sending does not. */
  disabled?: boolean
  onAsk(question: AskEvent): void
  /** Opens the settings panel, which is where a refused microphone is fixed. */
  onOpenSettings(): void
}

export interface AnswerLogProps {
  /** In order, oldest first. Every question without an answer yet is still being answered. */
  entries: readonly LogEntry[]
  onShow(artifactId: string): void
  onReplay(entryId: string): void
}
