/**
 * The log as it is read: every line stamped with the second it was asked at, said once per
 * moment rather than under every line, and every question still waiting for its answer.
 */

import { formatClock } from './clock.ts'
import type { LogEntry } from './types.ts'

export interface LogLine {
  entry: LogEntry
  /** The second it was asked at, or null when the line above already says it. */
  stamp: string | null
  /** True while this question is still waiting for its answer. */
  waiting: boolean
}

export function logLines(entries: readonly LogEntry[]): LogLine[] {
  const waiting = waitingOn(entries)
  const lines: LogLine[] = []
  let previous: string | null = null
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    if (!entry) continue
    const clock = formatClock(entry.at)
    lines.push({ entry, stamp: clock === previous ? null : clock, waiting: waiting.has(i) })
    previous = clock
  }
  return lines
}

/**
 * Which questions have no answer yet. Answers arrive in the order they were asked, so the
 * ones still outstanding are the last questions asked, however many answers are behind.
 */
function waitingOn(entries: readonly LogEntry[]): Set<number> {
  let outstanding = 0
  for (const entry of entries) outstanding += entry.role === 'user' ? 1 : -1

  const indexes = new Set<number>()
  for (let i = entries.length - 1; i >= 0 && outstanding > 0; i -= 1) {
    if (entries[i]?.role !== 'user') continue
    indexes.add(i)
    outstanding -= 1
  }
  return indexes
}
