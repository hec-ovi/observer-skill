/** Transcripts to drive the rail with, in the shape `transcript` produces. */

import type { Segment } from '../src/types.ts'

/** Seconds per sentence, which is what makes `SEGMENTS_3H` three hours long. */
export const STEP = 2

/** A three-hour podcast, at a sentence every two seconds. */
export const SEGMENTS_3H = 5400

export function transcriptOf(count: number): Segment[] {
  const segments: Segment[] = []
  for (let i = 0; i < count; i += 1) {
    segments.push({ i, start: i * STEP, end: i * STEP + STEP, text: `Sentence ${i}.` })
  }
  return segments
}
