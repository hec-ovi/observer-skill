/**
 * What was being said at second N, with enough either side to answer a question about it.
 * A binary search over the cached index, then one string the agent can read as it stands.
 */

import { fail } from '#errors'

import type { AtOptions, Segment, TranscriptWindow } from './schema.ts'
import { AtOptionsSchema } from './schema.ts'
import { indexAt, loadTranscript } from './store.ts'

export function clock(time: number): string {
  const whole = Math.max(0, Math.floor(time))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = whole % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`
}

/** The window as one readable string, with the pause marked where the user actually is. */
function flatten(time: number, before: Segment[], segment: Segment, after: Segment[]): string {
  const lead = before.map((s) => s.text).join(' ')
  const tail = after.map((s) => s.text).join(' ')
  const here = `[paused at ${clock(time)}] ${segment.text}`
  return [lead, here, tail].filter((part) => part.length > 0).join(' ')
}

export function at(sessionId: string, time: number, options: AtOptions = {}): TranscriptWindow {
  const { back, forward } = AtOptionsSchema.parse(options)
  const { doc, starts } = loadTranscript(sessionId)
  const segments = doc.segments

  const current = segments[indexAt(starts, time)]
  if (!current) {
    return fail(
      'NO_TRANSCRIPT',
      `Session ${sessionId} has a transcript with no segments.`,
      'Run the transcript again with another provider.',
    )
  }

  const before: Segment[] = []
  for (let i = current.i - 1; i >= 0; i--) {
    const segment = segments[i]
    if (!segment || segment.end <= time - back) break
    before.unshift(segment)
  }

  const after: Segment[] = []
  for (let i = current.i + 1; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment || segment.start > time + forward) break
    after.push(segment)
  }

  return { at: time, segment: current, before, after, text: flatten(time, before, current, after) }
}
