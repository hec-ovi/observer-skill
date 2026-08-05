import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openKnowledge } from '../fixtures.ts'

describe('addNote', () => {
  it('appends notes in the order they were written, background and current alike', async (t) => {
    const { knowledge, session } = await openKnowledge(t)
    const [concept] = await knowledge.writeConcepts(session.id, [
      { label: 'attention', kind: 'system', startsAt: 300, endsAt: 600 },
    ])
    assert.ok(concept)

    await knowledge.addNote(session.id, concept.id, {
      kind: 'background',
      text: 'Introduced in Attention Is All You Need.',
      source: 'https://arxiv.org/abs/1706.03762',
    })
    const updated = await knowledge.addNote(session.id, concept.id, {
      kind: 'current',
      text: 'Flash attention is what runs in production now.',
    })

    assert.deepEqual(
      updated.notes.map((note) => [note.kind, note.text]),
      [
        ['background', 'Introduced in Attention Is All You Need.'],
        ['current', 'Flash attention is what runs in production now.'],
      ],
    )
    assert.equal(updated.notes[0]?.source, 'https://arxiv.org/abs/1706.03762')
  })

  it('refuses a concept that was never written', async (t) => {
    const { knowledge, session } = await openKnowledge(t)

    await assert.rejects(
      () => knowledge.addNote(session.id, 'nosuch', { kind: 'background', text: 'orphan' }),
      { code: 'UNKNOWN_CONCEPT' },
    )
  })
})
