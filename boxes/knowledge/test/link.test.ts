import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DURATION, buildArtifact, openKnowledge } from '../fixtures.ts'

describe('linkArtifact', () => {
  it('binds a visual to a concept, and reads it back with that concept', async (t) => {
    const fixture = await openKnowledge(t)
    const { knowledge, session } = fixture
    const [concept] = await knowledge.writeConcepts(session.id, [
      { label: 'sampling rate', kind: 'definition', startsAt: 200, endsAt: 400 },
    ])
    assert.ok(concept)
    await buildArtifact(fixture, 'aliasing')

    const linked = await knowledge.linkArtifact(session.id, concept.id, 'aliasing')

    assert.deepEqual(linked.artifactIds, ['aliasing'])
    assert.deepEqual(
      knowledge.at(session.id, 300).artifacts.map((artifact) => artifact.id),
      ['aliasing'],
    )
  })

  it('lets the link range override the concept range for that visual', async (t) => {
    const fixture = await openKnowledge(t)
    const { knowledge, session } = fixture
    const [concept] = await knowledge.writeConcepts(session.id, [
      { label: 'convolution', kind: 'equation', startsAt: 0, endsAt: 600 },
    ])
    assert.ok(concept)
    await buildArtifact(fixture, 'kernel-sweep')

    await knowledge.linkArtifact(session.id, concept.id, 'kernel-sweep', {
      startsAt: 100,
      endsAt: 150,
    })

    const inside = knowledge.at(session.id, 120)
    assert.deepEqual(
      inside.artifacts.map((artifact) => artifact.id),
      ['kernel-sweep'],
    )
    const outside = knowledge.at(session.id, 400)
    assert.deepEqual(
      outside.concepts.map((c) => c.id),
      [concept.id],
    )
    assert.deepEqual(outside.artifacts, [])
  })

  it('keeps both visuals when two links to one concept run at once', async (t) => {
    const fixture = await openKnowledge(t)
    const { knowledge, session } = fixture
    const [concept] = await knowledge.writeConcepts(session.id, [
      { label: 'sampling rate', kind: 'definition', startsAt: 200, endsAt: 400 },
    ])
    assert.ok(concept)
    await buildArtifact(fixture, 'viz-a')
    await buildArtifact(fixture, 'viz-b')

    await Promise.all([
      knowledge.linkArtifact(session.id, concept.id, 'viz-a'),
      knowledge.linkArtifact(session.id, concept.id, 'viz-b'),
    ])

    assert.deepEqual(knowledge.byLabel(session.id, 'sampling rate')?.artifactIds, [
      'viz-a',
      'viz-b',
    ])
    assert.deepEqual(
      knowledge.at(session.id, 300).artifacts.map((artifact) => artifact.id),
      ['viz-a', 'viz-b'],
    )
  })

  it('erases nothing a note or a second pass writes while the link is in flight', async (t) => {
    const fixture = await openKnowledge(t)
    const { knowledge, session } = fixture
    const [concept] = await knowledge.writeConcepts(session.id, [
      { label: 'sampling rate', kind: 'definition', startsAt: 200, endsAt: 400, summary: 'first' },
    ])
    assert.ok(concept)
    await buildArtifact(fixture, 'viz')

    await Promise.all([
      knowledge.linkArtifact(session.id, concept.id, 'viz'),
      knowledge.addNote(session.id, concept.id, { kind: 'background', text: 'Shannon, 1949.' }),
      knowledge.writeConcepts(session.id, [
        {
          label: 'sampling rate',
          kind: 'definition',
          startsAt: 200,
          endsAt: 900,
          summary: 'second',
        },
      ]),
    ])

    const stored = knowledge.byLabel(session.id, 'sampling rate')
    assert.deepEqual(
      stored?.notes.map((note) => note.text),
      ['Shannon, 1949.'],
    )
    assert.equal(stored?.endsAt, 900)
    assert.equal(stored?.summary, 'second')
    assert.deepEqual(stored?.artifactIds, ['viz'])
  })

  it('moves a visual off the concept it was bound to when it is linked again', async (t) => {
    const fixture = await openKnowledge(t)
    const { knowledge, session } = fixture
    const [alpha, beta] = await knowledge.writeConcepts(session.id, [
      { label: 'alpha', kind: 'definition', startsAt: 100, endsAt: 200 },
      { label: 'beta', kind: 'definition', startsAt: 800, endsAt: 900 },
    ])
    assert.ok(alpha && beta)
    await buildArtifact(fixture, 'shared')

    await knowledge.linkArtifact(session.id, alpha.id, 'shared', { startsAt: 120, endsAt: 140 })
    const moved = await knowledge.linkArtifact(session.id, beta.id, 'shared')

    assert.deepEqual(moved.artifactIds, ['shared'])
    assert.deepEqual(knowledge.byLabel(session.id, 'alpha')?.artifactIds, [])
    assert.deepEqual(knowledge.at(session.id, 130).artifacts, [])
    assert.deepEqual(
      knowledge.at(session.id, 850).artifacts.map((artifact) => artifact.id),
      ['shared'],
    )
  })

  it('refuses a link range that leaves the video', async (t) => {
    const fixture = await openKnowledge(t)
    const { knowledge, session } = fixture
    const [concept] = await knowledge.writeConcepts(session.id, [
      { label: 'windowing', kind: 'definition', startsAt: 100, endsAt: 200 },
    ])
    assert.ok(concept)
    await buildArtifact(fixture, 'window-sweep')

    await assert.rejects(
      () =>
        knowledge.linkArtifact(session.id, concept.id, 'window-sweep', {
          startsAt: 100,
          endsAt: DURATION + 600,
        }),
      { code: 'RANGE_OUT_OF_BOUNDS' },
    )
  })

  it('refuses a visual that was never built', async (t) => {
    const { knowledge, session } = await openKnowledge(t)
    const [concept] = await knowledge.writeConcepts(session.id, [
      { label: 'phase shift', kind: 'definition', startsAt: 10, endsAt: 20 },
    ])
    assert.ok(concept)

    await assert.rejects(() => knowledge.linkArtifact(session.id, concept.id, 'nosuch'), {
      code: 'UNKNOWN_ARTIFACT',
    })
  })
})
