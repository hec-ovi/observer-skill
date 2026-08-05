/**
 * What the session has so far, in the five numbers the agent checks between passes.
 */

import * as z from 'zod/v4'
import type { Session } from '#session'

export const countsSchema = z.object({
  segments: z.number().int(),
  concepts: z.number().int(),
  notes: z.number().int(),
  /** Only the visuals that verified. A failed build is not a visual. */
  artifacts: z.number().int(),
  answers: z.number().int(),
})

export type Counts = z.infer<typeof countsSchema>

export function countsOf(session: Session): Counts {
  return {
    segments: session.transcript?.segmentCount ?? 0,
    concepts: session.concepts.length,
    notes: session.concepts.reduce((total, concept) => total + concept.notes.length, 0),
    artifacts: session.artifacts.filter((artifact) => artifact.status === 'built').length,
    answers: session.log.filter((entry) => entry.role === 'agent').length,
  }
}
