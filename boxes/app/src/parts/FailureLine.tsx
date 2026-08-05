/**
 * One failure, where it happened: what went wrong, what to do about it, and the way out when
 * there is one. There is no global toast anywhere in this page.
 */

import { CircleAlert } from 'lucide-react'
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
    <div className="failure" role="alert">
      <CircleAlert className="failure-mark" aria-hidden="true" />
      <p className="failure-message">{failure.message}</p>
      {failure.hint ? <p className="failure-hint">{failure.hint}</p> : null}
      {action ? <div className="failure-action">{action}</div> : null}
    </div>
  )
}
