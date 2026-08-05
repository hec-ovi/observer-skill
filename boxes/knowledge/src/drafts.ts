import { fail } from '#errors'
import { conceptDraftSchema, noteDraftSchema, timeRangeSchema } from './schema.ts'
import type {
  ConceptDraft,
  ConceptDraftInput,
  NoteDraft,
  NoteDraftInput,
  TimeRange,
  TimeRangeInput,
} from './schema.ts'

/**
 * Everything a caller hands over, checked before it can reach the record. A shape that does
 * not fit is `INVALID_CONCEPT` with the field named; a range that leaves the video is
 * `RANGE_OUT_OF_BOUNDS`.
 */

interface Issues {
  readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[]
}

function firstIssue(error: Issues): string {
  const issue = error.issues[0]
  if (issue === undefined) return 'invalid'
  const field = issue.path.map(String).join('.')
  return field === '' ? issue.message : `${field}: ${issue.message}`
}

const CONCEPT_HINT =
  'A concept needs a label, a kind of definition, equation, system or jargon, and a range in video seconds where endsAt is not before startsAt.'

export function readConcept(input: ConceptDraftInput): ConceptDraft {
  const result = conceptDraftSchema.safeParse(input)
  if (!result.success) {
    fail('INVALID_CONCEPT', `This concept cannot be written (${firstIssue(result.error)}).`, CONCEPT_HINT)
  }
  return result.data
}

export function readNote(input: NoteDraftInput): NoteDraft {
  const result = noteDraftSchema.safeParse(input)
  if (!result.success) {
    fail(
      'INVALID_CONCEPT',
      `This note cannot be attached (${firstIssue(result.error)}).`,
      'A note needs a kind of background or current and some text; source is optional.',
    )
  }
  return result.data
}

export function readRange(input: TimeRangeInput): TimeRange {
  const result = timeRangeSchema.safeParse(input)
  if (!result.success) {
    fail(
      'INVALID_CONCEPT',
      `This range cannot be used (${firstIssue(result.error)}).`,
      'A range is startsAt and endsAt, both in video seconds.',
    )
  }
  return result.data
}

/**
 * The range has to be a stretch of this video, or the lookup by second means nothing.
 * A source whose duration is unknown is checked for order and for a negative start only:
 * an unknown length is not a reason to refuse a concept the agent read out of the video.
 */
export function assertInBounds(what: string, range: TimeRange, duration: number | null): void {
  if (range.endsAt < range.startsAt) {
    fail(
      'INVALID_CONCEPT',
      `${what} ends at ${range.endsAt}s, before it starts at ${range.startsAt}s.`,
      'Write the range as startsAt then endsAt, in video seconds.',
    )
  }
  if (range.startsAt < 0) {
    fail(
      'RANGE_OUT_OF_BOUNDS',
      `${what} starts at ${range.startsAt}s, before the video does.`,
      'Keep the range inside the video duration.',
    )
  }
  if (duration !== null && range.endsAt > duration) {
    fail(
      'RANGE_OUT_OF_BOUNDS',
      `${what} covers ${range.startsAt}s to ${range.endsAt}s, outside this video's 0s to ${duration}s.`,
      'Keep the range inside the video duration.',
    )
  }
}
