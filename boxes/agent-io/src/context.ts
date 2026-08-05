/**
 * The context a pause arrives with: the words around that second, and the concepts covering
 * it with their notes and the visuals bound to them. Bounded by construction, so `wait` and
 * `where` never carry a whole transcript.
 */

import * as z from 'zod/v4'
import { CONCEPT_KINDS, NOTE_KINDS } from '#knowledge'
import { RESULT_BUDGET_CHARS, sizeOf } from './budget.ts'
import type { Runtime } from './runtime.ts'
import { seconds } from './schema.ts'

const noteView = z.object({
  kind: z.enum(knowledgeSchema.NOTE_KINDS),
  text: z.string(),
  source: z.string().nullable(),
})

export const conceptView = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(knowledgeSchema.CONCEPT_KINDS),
  startsAt: seconds,
  endsAt: seconds,
  summary: z.string(),
  notes: z.array(noteView),
  artifactIds: z.array(z.string()),
})

export const artifactView = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
})

export const contextView = z.object({
  /** The transcript around that second, already flattened into prose. */
  window: z.string(),
  concepts: z.array(conceptView),
  artifacts: z.array(artifactView),
})

export type ContextView = z.infer<typeof contextView>

/**
 * Concepts come back tightest range first, so trimming to the budget drops the broadest
 * one: the most specific thing the user could be asking about is never the one cut.
 */
export function contextAt(runtime: Runtime, sessionId: string, time: number): ContextView {
  const window = runtime.deps.transcript.at(sessionId, time)
  const coverage = runtime.deps.knowledge.at(sessionId, time)

  const concepts = coverage.concepts.map((concept) => ({
    id: concept.id,
    label: concept.label,
    kind: concept.kind,
    startsAt: concept.startsAt,
    endsAt: concept.endsAt,
    summary: concept.summary,
    notes: concept.notes.map((note) => ({ kind: note.kind, text: note.text, source: note.source })),
    artifactIds: concept.artifactIds,
  }))
  const artifacts = coverage.artifacts.map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
  }))

  const context: ContextView = { window: window.text, concepts, artifacts }
  while (context.concepts.length > 1 && sizeOf(context) > RESULT_BUDGET_CHARS) {
    context.concepts.pop()
  }
  return context
}
