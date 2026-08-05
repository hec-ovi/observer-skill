/**
 * One failure, where it happened: what went wrong, what to do about it, and the way out when
 * there is one. There is no global toast anywhere in this page.
 */

import type { ReactNode } from 'react'
import type { Failure } from '../session/record.ts'
import './failure.css'

export interface FailureLineProps {
  failure: Failure
  /** A button that gets past this, when the user can. */
  action?: ReactNode
}

export function FailureLine({ failure, action }: FailureLineProps) {
  return (
    <p className="failure" role="alert">
      <span className="failure-message">{failure.message}</span>
      {failure.hint ? <span className="failure-hint">{failure.hint}</span> : null}
      {action}
    </p>
  )
}
