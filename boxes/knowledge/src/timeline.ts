import type { Artifact, Concept } from '#session'

export interface Coverage {
  concepts: Concept[]
  artifacts: Artifact[]
}

/**
 * Tightest range first, so the most specific thing the user could be asking about is the
 * first thing read. Equal spans go to the earlier one, then to the lower id, so the same
 * concepts and the same second always give the same list.
 */
function byTightestRange(a: Concept, b: Concept): number {
  const span = a.endsAt - a.startsAt - (b.endsAt - b.startsAt)
  if (span !== 0) return span
  if (a.startsAt !== b.startsAt) return a.startsAt - b.startsAt
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** A link range overrides the concept's own: the visual applies only inside it. */
function showsAt(artifact: Artifact, time: number): boolean {
  if (artifact.startsAt !== null && time < artifact.startsAt) return false
  if (artifact.endsAt !== null && time > artifact.endsAt) return false
  return true
}

/**
 * One session's concepts, sorted once. A lookup walks the sorted list and keeps what covers
 * the second: no sorting, no I/O, and nothing allocated beyond the answer. It is rebuilt
 * when the record it was built from is replaced, never per lookup.
 */
export class Timeline {
  readonly #concepts: readonly Concept[]
  readonly #artifacts: readonly Artifact[]
  readonly #ordered: readonly Concept[]

  constructor(concepts: readonly Concept[], artifacts: readonly Artifact[]) {
    this.#concepts = concepts
    this.#artifacts = artifacts
    this.#ordered = [...concepts].sort(byTightestRange)
  }

  /** True while the record this was built from is still the record being read. */
  matches(concepts: readonly Concept[], artifacts: readonly Artifact[]): boolean {
    return this.#concepts === concepts && this.#artifacts === artifacts
  }

  at(time: number): Coverage {
    const concepts: Concept[] = []
    const linked = new Set<string>()
    for (const concept of this.#ordered) {
      if (time < concept.startsAt || time > concept.endsAt) continue
      concepts.push(concept)
      for (const artifactId of concept.artifactIds) linked.add(artifactId)
    }
    const artifacts =
      linked.size === 0
        ? []
        : this.#artifacts.filter((artifact) => linked.has(artifact.id) && showsAt(artifact, time))
    return { concepts, artifacts }
  }
}
