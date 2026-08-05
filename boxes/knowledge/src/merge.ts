import type { Concept, ConceptInput } from '#session'
import { conceptIdFor } from './ids.ts'
import type { ConceptDraft } from './schema.ts'

/**
 * The write plan: one entry per label, its range widened over whatever is stored, and no
 * `notes` or `artifactIds` key at all, so the store keeps the research and the visuals a
 * first pass attached. Drafts are applied in order, so a label written twice in one call
 * behaves exactly like a label written in two calls.
 */
export function planWrite(
  stored: readonly Concept[],
  drafts: readonly ConceptDraft[],
): ConceptInput[] {
  const planned = new Map<string, ConceptInput>()
  for (const draft of drafts) {
    const id = conceptIdFor(draft.label)
    const previous = planned.get(id) ?? stored.find((concept) => concept.id === id)
    planned.set(id, {
      id,
      label: draft.label,
      kind: draft.kind,
      startsAt: previous === undefined ? draft.startsAt : Math.min(previous.startsAt, draft.startsAt),
      endsAt: previous === undefined ? draft.endsAt : Math.max(previous.endsAt, draft.endsAt),
      summary: draft.summary,
    })
  }
  return [...planned.values()]
}
