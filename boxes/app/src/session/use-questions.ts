/**
 * The exchange the log shows: the agent's answers from the record, and the questions this
 * page asked, which the record does not keep.
 *
 * A question is remembered with the number of answers that were already in the log, so it
 * stays above the answer that lands under it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LogEntry } from './record.ts'

interface Asked {
  entry: LogEntry
  /** How long the record's log was when this was asked. */
  after: number
}

function weave(log: readonly LogEntry[], asked: readonly Asked[]): LogEntry[] {
  const entries: LogEntry[] = []
  for (let i = 0; i <= log.length; i += 1) {
    for (const question of asked) {
      if (question.after === i) entries.push(question.entry)
    }
    const entry = log[i]
    if (entry) entries.push(entry)
  }
  return entries
}

export interface Questions {
  entries: readonly LogEntry[]
  /** One question, on screen from the moment it leaves the page. */
  remember(text: string, at: number): void
}

export function useQuestions(log: readonly LogEntry[]): Questions {
  const [asked, setAsked] = useState<readonly Asked[]>([])

  const answers = useRef(log.length)
  useEffect(() => {
    answers.current = log.length
  })

  const asks = useRef(0)
  const remember = useCallback((text: string, at: number): void => {
    asks.current += 1
    const entry: LogEntry = {
      id: `asked-${asks.current}`,
      role: 'user',
      text,
      at,
      artifactId: null,
      spoken: false,
    }
    setAsked((current) => [...current, { entry, after: answers.current }])
  }, [])

  const entries = useMemo(() => weave(log, asked), [log, asked])
  return { entries, remember }
}
