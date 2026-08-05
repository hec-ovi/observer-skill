/**
 * The session, in words: the rail that follows the video, and the dialogue under it.
 *
 * This composes `dialogue` and decides nothing. Which second a question is about, which
 * lines exist, and what an answer means all belong elsewhere.
 */

import { AnswerLog, AskBox, TranscriptRail } from '@dialogue/index.ts'
import type { AskEvent, ListenerSource, RailPosition, Segment } from '@dialogue/index.ts'
import type { LogEntry } from '../session/record.ts'
import './session.css'

export interface SessionProps {
  segments: readonly Segment[]
  position: RailPosition
  entries: readonly LogEntry[]
  listener: ListenerSource
  /** True when no agent is attached: the question box keeps the words and says why. */
  disabled: boolean
  at(): number
  onSeek(seconds: number): void
  onAsk(question: AskEvent): void
  onShow(artifactId: string): void
  onReplay(entryId: string): void
  onOpenSettings(): void
}

export function Session({
  segments,
  position,
  entries,
  listener,
  disabled,
  at,
  onSeek,
  onAsk,
  onShow,
  onReplay,
  onOpenSettings,
}: SessionProps) {
  return (
    <section className="session">
      <div className="session-rail">
        <TranscriptRail segments={segments} position={position} onSeek={onSeek} />
      </div>

      <div className="session-dialogue">
        <AskBox
          at={at}
          listener={listener}
          disabled={disabled}
          onAsk={onAsk}
          onOpenSettings={onOpenSettings}
        />
        <AnswerLog entries={entries} onShow={onShow} onReplay={onReplay} />
      </div>
    </section>
  )
}
