/**
 * The loader: the phase, what is happening in it, and a real count.
 *
 * A phase that failed says so here, with the hint and a way to ask for it again, because
 * this is where the user was waiting when it happened.
 */

import { Check } from 'lucide-react'
import { FailureLine } from '../parts/FailureLine.tsx'
import type { ArtifactRecord, Concept, Failure, Phase, Progress } from '../session/record.ts'
import { phaseCount, phaseFill, phaseNames, phaseTitle } from './preparing-lines.ts'
import './preparing.css'

export interface PreparingProps {
  phase: Phase
  progress: Progress
  concepts: readonly Concept[]
  artifacts: readonly ArtifactRecord[]
  failure: Failure | null
  onRetry(): void
}

export function Preparing({
  phase,
  progress,
  concepts,
  artifacts,
  failure,
  onRetry,
}: PreparingProps) {
  const count = phaseCount(phase, progress, concepts, artifacts)
  const names = phaseNames(phase, concepts, artifacts)
  const fill = phaseFill(progress)

  return (
    <section className="preparing rise" aria-label="Preparing">
      <div className="preparing-head">
        <div className="preparing-said">
          <h2 className="preparing-phase">{phaseTitle(phase)}</h2>
          {progress.message ? <p className="preparing-message">{progress.message}</p> : null}
        </div>
        {count ? <span className="preparing-count">{count}</span> : null}
      </div>

      {/* The bar says in movement what the head already says in words, so it is not read out. */}
      {fill === null ? (
        <div className="preparing-bar shimmer" aria-hidden="true" />
      ) : (
        <div className="preparing-bar preparing-track" aria-hidden="true">
          <div className="preparing-fill" style={{ inlineSize: `${fill}%` }} />
        </div>
      )}

      {names.length > 0 ? (
        <ul className="preparing-names">
          {names.map((name) => (
            <li className="preparing-name rise" key={name}>
              <Check className="preparing-mark" aria-hidden="true" />
              {name}
            </li>
          ))}
        </ul>
      ) : null}

      {failure ? (
        <FailureLine
          failure={failure}
          action={
            <button className="button" type="button" onClick={onRetry}>
              Try again
            </button>
          }
        />
      ) : null}
    </section>
  )
}
