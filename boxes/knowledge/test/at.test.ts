import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ConceptDraftInput } from '#knowledge'
import { DURATION, openKnowledge } from '../fixtures.ts'

const OVERLAPPING: ConceptDraftInput[] = [
  { label: 'the whole talk', kind: 'system', startsAt: 0, endsAt: DURATION },
  { label: 'discrete transform', kind: 'definition', startsAt: 100, endsAt: 400 },
  { label: 'frequency bin', kind: 'jargon', startsAt: 150, endsAt: 200 },
]

describe('at', () => {
  it('answers with the tightest range first, the same way every time', async (t) => {
    const { knowledge, session } = await openKnowledge(t)
    await knowledge.writeConcepts(session.id, OVERLAPPING)

    const covering = knowledge.at(session.id, 160)

    assert.deepEqual(
      covering.concepts.map((concept) => concept.label),
      ['frequency bin', 'discrete transform', 'the whole talk'],
    )
    assert.deepEqual(knowledge.at(session.id, 160), covering)
  })

  it('covers the second where one range ends and the next begins', async (t) => {
    const { knowledge, session } = await openKnowledge(t)
    await knowledge.writeConcepts(session.id, [
      { label: 'intro', kind: 'definition', startsAt: 0, endsAt: 60 },
      { label: 'setup', kind: 'definition', startsAt: 60, endsAt: 120 },
    ])

    assert.deepEqual(
      knowledge.at(session.id, 60).concepts.map((concept) => concept.label),
      ['intro', 'setup'],
    )
  })

  it('answers with nothing for a second no concept covers', async (t) => {
    const { knowledge, session } = await openKnowledge(t)
    await knowledge.writeConcepts(session.id, [
      { label: 'discrete transform', kind: 'definition', startsAt: 100, endsAt: 400 },
    ])

    assert.deepEqual(knowledge.at(session.id, 1200), { concepts: [], artifacts: [] })
  })
})
