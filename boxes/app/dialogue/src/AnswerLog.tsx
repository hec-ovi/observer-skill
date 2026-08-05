/**
 * The exchange, in order, newest last.
 *
 * A question sits here with a working indicator under it until its answer lands, an answer
 * that came with a visual keeps a way to open it again, and one that was spoken can be heard
 * again. Nothing is collapsed, truncated, or hidden behind a "show more".
 */

import { useMemo } from 'react'
import { logLines } from './log-lines.ts'
import type { AnswerLogProps } from './types.ts'
import './log.css'

export function AnswerLog({ entries, onShow, onReplay }: AnswerLogProps) {
  const lines = useMemo(() => logLines(entries), [entries])

  return (
    <ol className="log" aria-label="Questions and answers">
      {lines.map(({ entry, stamp, waiting }) => {
        const artifactId = entry.artifactId ?? null
        return (
          <li key={entry.id} className="log-entry" data-role={entry.role}>
            {stamp ? <span className="log-clock">{stamp}</span> : null}
            <p className="log-text">{entry.text}</p>

            {artifactId || entry.spoken ? (
              <p className="log-actions">
                {artifactId ? (
                  <button type="button" onClick={() => onShow(artifactId)}>
                    Show visual
                  </button>
                ) : null}
                {entry.spoken ? (
                  <button type="button" onClick={() => onReplay(entry.id)}>
                    Replay
                  </button>
                ) : null}
              </p>
            ) : null}

            {waiting ? (
              <p className="log-working" role="status">
                Working
              </p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
