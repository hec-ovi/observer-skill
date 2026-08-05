import { fail } from '#errors'
import type { Artifact, Concept, Session, SessionStore } from '#session'
import { assertInBounds, readConcept, readNote, readRange } from './drafts.ts'
import { conceptIdFor } from './ids.ts'
import { planLink } from './links.ts'
import { planWrite } from './merge.ts'
import { SessionQueue } from './queue.ts'
import type { ConceptDraftInput, NoteDraftInput, TimeRange, TimeRangeInput } from './schema.ts'
import { Timeline } from './timeline.ts'
import type { Coverage } from './timeline.ts'

export interface KnowledgeOptions {
  store: SessionStore
}

function requireConcept(session: Session, conceptId: string): Concept {
  const concept = session.concepts.find((candidate) => candidate.id === conceptId)
  if (concept === undefined) {
    fail(
      'UNKNOWN_CONCEPT',
      `Session ${session.id} has no concept ${conceptId}.`,
      'Write the concept first; the ids come back from that call and from byLabel.',
    )
  }
  return concept
}

function requireArtifact(session: Session, artifactId: string): Artifact {
  const artifact = session.artifacts.find((candidate) => candidate.id === artifactId)
  if (artifact === undefined) {
    fail(
      'UNKNOWN_ARTIFACT',
      `Session ${session.id} has no artifact ${artifactId}.`,
      'Build the visual before binding it to a concept.',
    )
  }
  return artifact
}

/**
 * What the agent worked out about one video: the concepts, the notes attached to them, the
 * visuals bound to them, and the lookup by second that runs inside a pause.
 */
export class Knowledge {
  readonly #store: SessionStore
  readonly #writes = new SessionQueue()
  readonly #timelines = new Map<string, Timeline>()

  constructor(store: SessionStore) {
    this.#store = store
  }

  // --- writing -------------------------------------------------------------

  /** New labels are added, known labels widen their range and take the new summary. */
  async writeConcepts(sessionId: string, concepts: ConceptDraftInput[]): Promise<Concept[]> {
    const session = this.#store.get(sessionId)
    const drafts = concepts.map((input) => {
      const draft = readConcept(input)
      assertInBounds(`Concept "${draft.label}"`, draft, session.source.duration)
      return draft
    })
    return this.#writes.run(sessionId, async () => {
      const plan = planWrite(this.#store.get(sessionId).concepts, drafts)
      const written = await this.#store.appendConcepts(sessionId, plan)
      return plan.map((entry) => requireConcept(written, entry.id))
    })
  }

  /** Notes are appended and never edited: a later one wins by being later, both stay. */
  async addNote(sessionId: string, conceptId: string, note: NoteDraftInput): Promise<Concept> {
    const session = this.#store.get(sessionId)
    requireConcept(session, conceptId)
    const written = await this.#store.appendNotes(sessionId, conceptId, [readNote(note)])
    return requireConcept(written, conceptId)
  }

  /**
   * Binds a built visual to a concept, and to the stretch of video where it applies. The
   * whole read and write takes a turn on the session queue, so a second link started in the
   * same tick adds its visual instead of writing over the first.
   */
  async linkArtifact(
    sessionId: string,
    conceptId: string,
    artifactId: string,
    range?: TimeRangeInput,
  ): Promise<Concept> {
    const session = this.#store.get(sessionId)
    const concept = requireConcept(session, conceptId)
    requireArtifact(session, artifactId)
    let bound: TimeRange | null = null
    if (range !== undefined) {
      bound = readRange(range)
      assertInBounds(
        `The link from "${concept.label}" to ${artifactId}`,
        bound,
        session.source.duration,
      )
    }
    return this.#writes.run(sessionId, () => this.#link(sessionId, conceptId, artifactId, bound))
  }

  /** The link itself, on the record as it stands when this session's turn comes. */
  async #link(
    sessionId: string,
    conceptId: string,
    artifactId: string,
    bound: TimeRange | null,
  ): Promise<Concept> {
    const artifact = requireArtifact(this.#store.get(sessionId), artifactId)
    const boundTo = artifact.conceptId
    const stored = await this.#store.putArtifact(sessionId, {
      ...artifact,
      conceptId,
      startsAt: bound === null ? null : bound.startsAt,
      endsAt: bound === null ? null : bound.endsAt,
    })
    const previous =
      boundTo === null || boundTo === conceptId
        ? null
        : (stored.concepts.find((candidate) => candidate.id === boundTo) ?? null)
    const written = await this.#store.appendConcepts(
      sessionId,
      planLink(requireConcept(stored, conceptId), previous, artifactId),
    )
    return requireConcept(written, conceptId)
  }

  // --- reading -------------------------------------------------------------

  /** Concepts covering this second, tightest range first, with the visuals bound to them. */
  at(sessionId: string, time: number): Coverage {
    return this.#timeline(this.#store.get(sessionId)).at(time)
  }

  byLabel(sessionId: string, label: string): Concept | null {
    const id = conceptIdFor(label)
    return this.#store.get(sessionId).concepts.find((concept) => concept.id === id) ?? null
  }

  /** The fast-iteration list: the jargon with its summaries, by first appearance. */
  jargon(sessionId: string): Concept[] {
    return this.#store
      .get(sessionId)
      .concepts.filter((concept) => concept.kind === 'jargon')
      .sort((a, b) => a.startsAt - b.startsAt)
  }

  all(sessionId: string): Concept[] {
    return this.#store.get(sessionId).concepts
  }

  /** One index per session, rebuilt only when the record it was built from is replaced. */
  #timeline(session: Session): Timeline {
    const cached = this.#timelines.get(session.id)
    if (cached !== undefined && cached.matches(session.concepts, session.artifacts)) return cached
    const built = new Timeline(session.concepts, session.artifacts)
    this.#timelines.set(session.id, built)
    return built
  }
}

export function createKnowledge(options: KnowledgeOptions): Knowledge {
  return new Knowledge(options.store)
}
