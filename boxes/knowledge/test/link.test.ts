import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildArtifact, openKnowledge } from '../fixtures.ts'

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
