/** Reading the transcript: a page of segments, optionally bounded by time. */

import type { ReadOptions, TranscriptPage } from './schema.ts'
import { ReadOptionsSchema } from './schema.ts'
import { loadTranscript } from './store.ts'

export function read(sessionId: string, options: ReadOptions = {}): TranscriptPage {
  const { from, to, offset, limit } = ReadOptionsSchema.parse(options)
  const { doc } = loadTranscript(sessionId)

  const inRange = doc.segments.filter(
    (segment) => (from === undefined || segment.end > from) && (to === undefined || segment.start < to),
  )

  const size = limit ?? Math.max(0, inRange.length - offset)
  const segments = inRange.slice(offset, offset + size)
  const next = offset + segments.length

  return {
    segments,
    offset,
    total: inRange.length,
    ...(next < inRange.length ? { nextOffset: next } : {}),
  }
}
