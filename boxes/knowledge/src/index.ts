/**
 * knowledge: the concepts of one video, the notes attached to them, the visuals bound to
 * them, and the lookup that answers "what covers this second" fast enough to sit inside a
 * pause.
 */

export { createKnowledge } from './knowledge.ts'
export type { Knowledge, KnowledgeOptions } from './knowledge.ts'

export { CONCEPT_KINDS, NOTE_KINDS } from './schema.ts'
export { conceptDraftSchema, noteDraftSchema, timeRangeSchema } from './schema.ts'
export type {
  ConceptDraft,
  ConceptDraftInput,
  NoteDraft,
  NoteDraftInput,
  TimeRange,
  TimeRangeInput,
} from './schema.ts'

export type { Coverage } from './timeline.ts'
