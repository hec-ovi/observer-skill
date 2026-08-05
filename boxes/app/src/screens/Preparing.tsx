/**
 * The loader: the phase, what is happening in it, and a real count.
 *
 * A phase that failed says so here, with the hint and a way to ask for it again, because
 * this is where the user was waiting when it happened.
 */

import { FailureLine } from '../parts/FailureLine.tsx'
import type { ArtifactRecord, Concept, Failure, Phase, Progress } from '../session/record.ts'
import { phaseCount, phaseNames, phaseTitle } from './preparing-lines.ts'
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

  return (
    <section className="preparing" aria-label="Preparing">
      <p className="preparing-head">
        <span className="preparing-phase">{phaseTitle(phase)}</span>
        {count ? <span className="preparing-count">{count}</span> : null}
      </p>

      {progress.message ? <p className="preparing-message">{progress.message}</p> : null}

      {names.length > 0 ? (
        <ul className="preparing-names">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      ) : null}

      {failure ? (
        <FailureLine
          failure={failure}
          action={
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          }
        />
      ) : null}
    </section>
  )
}
