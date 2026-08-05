/**
 * The transcript, following the video.
 *
 * It marks the line being spoken without enlarging it, seeks where it is clicked, and draws
 * only the rows around the viewport, so three hours of transcript costs the same as three
 * minutes.
 */

import { type ReactNode, useCallback, useMemo } from 'react'
import { formatClock } from './clock.ts'
import { useRailWindow } from './rail-window.ts'
import { SegmentIndex } from './segment-index.ts'
import type { TranscriptRailProps } from './types.ts'
import './rail.css'

export function TranscriptRail({ segments, position, onSeek }: TranscriptRailProps) {
  const index = useMemo(() => new SegmentIndex(segments), [segments])
  const current = index.indexAt(position.time)
  const { viewportRef, start, end, total, offsetOf, measure, onScroll } = useRailWindow({
    count: segments.length,
    current,
    playing: position.state === 'playing',
  })

  const attach = useCallback(
    (el: HTMLLIElement | null): void => {
      if (el) measure(Number(el.dataset['index']), el)
    },
    [measure],
  )

  const rows: ReactNode[] = []
  for (let i = start; i < end; i += 1) {
    const segment = segments[i]
    if (!segment) continue
    rows.push(
      <li
        key={i}
        className="rail-row"
        data-index={i}
        ref={attach}
        style={{ transform: `translateY(${offsetOf(i)}px)` }}
        aria-posinset={i + 1}
        aria-setsize={segments.length}
      >
        <button
          type="button"
          className="rail-line"
          aria-current={i === current ? 'true' : undefined}
          onClick={() => onSeek(segment.start)}
        >
          <span className="rail-clock">{formatClock(segment.start)}</span>
          <span className="rail-text">{segment.text}</span>
        </button>
      </li>,
    )
  }

  return (
    <div className="rail" ref={viewportRef} onScroll={onScroll}>
      <ol className="rail-rows" style={{ height: `${total}px` }} aria-label="Transcript">
        {rows}
      </ol>
    </div>
  )
}
