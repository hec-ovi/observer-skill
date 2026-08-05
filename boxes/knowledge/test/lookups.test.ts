import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ConceptDraftInput } from '#knowledge'
import { openKnowledge } from '../fixtures.ts'

const NYQUIST: ConceptDraftInput = {
  label: 'Nyquist rate',
  kind: 'jargon',
  startsAt: 200,
  endsAt: 260,
  summary: 'Twice the highest frequency.',
}

const WRITTEN: ConceptDraftInput[] = [
  {
    label: 'aliasing',
    kind: 'jargon',
    startsAt: 500,
    endsAt: 560,
    summary: 'A frequency read as a lower one.',
  },
  { label: 'the whole talk', kind: 'system', startsAt: 0, endsAt: 1800 },
  NYQUIST,
]

describe('lookups', () => {
  it('finds a concept by any spelling of its label, and nothing for one never written', async (t) => {
    const { knowledge, session } = await openKnowledge(t)
    const [written] = await knowledge.writeConcepts(session.id, [NYQUIST])
    assert.ok(written)

    assert.equal(knowledge.byLabel(session.id, 'nyquist  RATE')?.id, written.id)
    assert.equal(knowledge.byLabel(session.id, 'shannon rate'), null)
  })

  it('lists the jargon with its summaries, in the order it first appears', async (t) => {
    const { knowledge, session } = await openKnowledge(t)
    await knowledge.writeConcepts(session.id, WRITTEN)

    assert.deepEqual(
      knowledge.jargon(session.id).map((concept) => [concept.label, concept.summary]),
      [
        ['Nyquist rate', 'Twice the highest frequency.'],
        ['aliasing', 'A frequency read as a lower one.'],
      ],
    )
  })

  it('lists every concept as it is stored', async (t) => {
    const { knowledge, session } = await openKnowledge(t)
    await knowledge.writeConcepts(session.id, WRITTEN)

    assert.deepEqual(
      knowledge.all(session.id).map((concept) => concept.label),
      ['aliasing', 'the whole talk', 'Nyquist rate'],
    )
  })
})
