import * as z from 'zod/v4'

/**
 * What a caller writes. The stored shapes (`Concept`, `Note`, `Artifact`) belong to
 * `session`; these are the drafts that become them, without the fields this box fills in:
 * a concept's id comes from its label, a note's id and timestamp come from the store.
 */

export const CONCEPT_KINDS = ['definition', 'equation', 'system', 'jargon'] as const
export const NOTE_KINDS = ['background', 'current'] as const

/** Video seconds. Bounds are checked against the source duration, not here. */
const seconds = z.number()

export const conceptDraftSchema = z.object({
  label: z.string().trim().min(1),
  kind: z.enum(CONCEPT_KINDS),
  startsAt: seconds,
  endsAt: seconds,
  summary: z.string().default(''),
})
export type ConceptDraft = z.infer<typeof conceptDraftSchema>
export type ConceptDraftInput = z.input<typeof conceptDraftSchema>

/** `current` marks something that changed after the video was recorded. */
export const noteDraftSchema = z.object({
  kind: z.enum(NOTE_KINDS),
  text: z.string().trim().min(1),
  source: z.string().nullable().default(null),
})
export type NoteDraft = z.infer<typeof noteDraftSchema>
export type NoteDraftInput = z.input<typeof noteDraftSchema>

/** The stretch of video a link is about, when it is not the concept's own. */
export const timeRangeSchema = z.object({ startsAt: seconds, endsAt: seconds })
export type TimeRange = z.infer<typeof timeRangeSchema>
export type TimeRangeInput = z.input<typeof timeRangeSchema>
