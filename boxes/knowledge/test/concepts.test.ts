import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ConceptDraftInput } from '#knowledge'
import { openKnowledge } from '../fixtures.ts'

const FOURIER: ConceptDraftInput = {
  label: 'Fourier transform',
  kind: 'equation',
  startsAt: 120,
  endsAt: 300,
  summary: 'A signal read as a sum of sines.',
}

describe('writeConcepts', () => {
  it('gives one id to one label however it is written, and merges the second pass into it', async (t) => {
    const { knowledge, session } = await openKnowledge(t)

    const [first] = await knowledge.writeConcepts(session.id, [FOURIER])
    assert.ok(first)
    await knowledge.addNote(session.id, first.id, {
      kind: 'background',
      text: 'Joseph Fourier published it in 1807.',
    })

    const [merged] = await knowledge.writeConcepts(session.id, [
      {
        label: '  Fourier-Transform  ',
        kind: 'equation',
        startsAt: 90,
        endsAt: 240,
        summary: 'Time in, frequencies out.',
      },
    ])

    assert.ok(merged)
    assert.equal(merged.id, first.id)
    assert.equal(merged.startsAt, 90)
    assert.equal(merged.endsAt, 300)
    assert.equal(merged.summary, 'Time in, frequencies out.')
    assert.deepEqual(
      merged.notes.map((note) => note.text),
      ['Joseph Fourier published it in 1807.'],
    )

    const [again] = await knowledge.writeConcepts(session.id, [
      { label: 'Fourier transform', kind: 'equation', startsAt: 90, endsAt: 300 },
    ])
    assert.equal(again?.summary, 'Time in, frequencies out.')
    assert.equal(knowledge.all(session.id).length, 1)
  })

  it('keeps two different labels apart', async (t) => {
    const { knowledge, session } = await openKnowledge(t)

    const written = await knowledge.writeConcepts(session.id, [
      { label: 'gradient', kind: 'definition', startsAt: 0, endsAt: 60 },
      { label: 'gradient descent', kind: 'system', startsAt: 60, endsAt: 120 },
    ])

    assert.equal(written.length, 2)
    assert.notEqual(written[0]?.id, written[1]?.id)
    assert.equal(knowledge.all(session.id).length, 2)
  })

  it('refuses a concept with no label, an unknown kind, or an end before its start', async (t) => {
    const { knowledge, session } = await openKnowledge(t)

    await assert.rejects(
      () => knowledge.writeConcepts(session.id, [{ ...FOURIER, label: '   ' }]),
      { code: 'INVALID_CONCEPT' },
    )
    await assert.rejects(
      () =>
        knowledge.writeConcepts(session.id, [
          { ...FOURIER, kind: 'vibe' as ConceptDraftInput['kind'] },
        ]),
      { code: 'INVALID_CONCEPT' },
    )
    await assert.rejects(
      () => knowledge.writeConcepts(session.id, [{ ...FOURIER, startsAt: 300, endsAt: 120 }]),
      { code: 'INVALID_CONCEPT' },
    )
  })

  it('refuses a range that leaves the video', async (t) => {
    const { knowledge, session } = await openKnowledge(t)

    await assert.rejects(
      () => knowledge.writeConcepts(session.id, [{ ...FOURIER, endsAt: 2400 }]),
      { code: 'RANGE_OUT_OF_BOUNDS' },
    )
    await assert.rejects(
      () => knowledge.writeConcepts(session.id, [{ ...FOURIER, startsAt: -5 }]),
      { code: 'RANGE_OUT_OF_BOUNDS' },
    )
  })

  it('refuses a session it does not have', async (t) => {
    const { knowledge } = await openKnowledge(t)

    await assert.rejects(() => knowledge.writeConcepts('nosuch', [FOURIER]), {
      code: 'UNKNOWN_SESSION',
    })
  })
})
