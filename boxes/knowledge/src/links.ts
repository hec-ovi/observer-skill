import type { Concept, ConceptInput } from '#session'

/**
 * A link write carries the artifact ids and nothing else. `appendConcepts` merges an entry
 * into the concept that already has that id, so the label, the range, the summary and the
 * notes stay whatever the research passes wrote; sending a whole concept back would undo a
 * pass that landed while the visual was being bound. The store types an entry as a full
 * concept because that is also how a new one is created; patching one already stored is
 * what its contract promises.
 */
function linkPatch(conceptId: string, artifactIds: string[]): ConceptInput {
  return { id: conceptId, artifactIds } as unknown as ConceptInput
}

/**
 * Where a visual belongs after a link: on the concept it was just bound to, and off the one
 * it was bound to before, as one write so the record is never half-moved. An artifact
 * belongs to a single concept, which is what `Artifact.conceptId` says.
 */
export function planLink(
  target: Concept,
  previous: Concept | null,
  artifactId: string,
): ConceptInput[] {
  const plan: ConceptInput[] = []
  if (previous !== null && previous.id !== target.id && previous.artifactIds.includes(artifactId)) {
    plan.push(linkPatch(previous.id, previous.artifactIds.filter((id) => id !== artifactId)))
  }
  plan.push(
    linkPatch(
      target.id,
      target.artifactIds.includes(artifactId)
        ? [...target.artifactIds]
        : [...target.artifactIds, artifactId],
    ),
  )
  return plan
}
