/**
 * The log as it is read: every line stamped with the second it was asked at, said once per
 * moment rather than under every line, and the one question still waiting for its answer.
 */

import { formatClock } from './clock.ts'
import type { LogEntry } from './types.ts'

export interface LogLine {
  entry: LogEntry
  /** The second it was asked at, or null when the line above already says it. */
  stamp: string | null
  /** True while this question has nothing under it yet. */
  waiting: boolean
}

export function logLines(entries: readonly LogEntry[]): LogLine[] {
  const lines: LogLine[] = []
  let previous: string | null = null
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    if (!entry) continue
    const clock = formatClock(entry.at)
    lines.push({
      entry,
      stamp: clock === previous ? null : clock,
      waiting: entry.role === 'user' && i === entries.length - 1,
    })
    previous = clock
  }
  return lines
}
