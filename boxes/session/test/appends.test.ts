import assert from 'node:assert/strict'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { createStore } from '#session'
import { openSession } from '../fixtures.ts'

const CONCEPT = {
  id: 'fourier-transform',
  label: 'Fourier transform',
  kind: 'equation',
  startsAt: 120,
  endsAt: 300,
  summary: 'Signal as a sum of sines',
} as const

describe('appends', () => {
  it('adds a concept, then patches it without losing its notes', async (t) => {
    const { store, session } = await openSession(t)

    await store.appendConcepts(session.id, [CONCEPT])
    await store.appendNotes(session.id, CONCEPT.id, [
      { kind: 'background', text: 'Named after Joseph Fourier' },
    ])
    const after = await store.appendConcepts(session.id, [{ ...CONCEPT, endsAt: 420 }])

    assert.equal(after.concepts.length, 1)
    const concept = after.concepts[0]
    assert.equal(concept?.endsAt, 420)
    assert.equal(concept?.notes.length, 1)
    assert.match(concept?.notes[0]?.id ?? '', /\S/)
    assert.equal(concept?.notes[0]?.source, null)
  })

  it('refuses notes for a concept the session does not have', async (t) => {
    const { store, session } = await openSession(t)

    await assert.rejects(
      () => store.appendNotes(session.id, 'ghost', [{ kind: 'current', text: 'x' }]),
      { code: 'INVALID_PATCH' },
    )
  })

  it('stores artifact paths relative to home, so the file travels', async (t) => {
    const { home, store, session } = await openSession(t)

    const stored = await store.putArtifact(session.id, {
      id: 'spectrum',
      title: 'Spectrum of the signal',
      kind: 'chart',
      status: 'built',
      bundlePath: join(home, 'sessions', session.id, 'artifacts', 'spectrum.js'),
    })

    assert.equal(stored.artifacts[0]?.bundlePath, `sessions/${session.id}/artifacts/spectrum.js`)
    assert.equal(stored.artifacts[0]?.snapshotPath, null)
  })

  it('refuses an artifact written outside home', async (t) => {
    const { store, session } = await openSession(t)

    await assert.rejects(
      () =>
        store.putArtifact(session.id, {
          id: 'stray',
          title: 'Stray',
          kind: 'chart',
          status: 'built',
          bundlePath: '/etc/passwd',
        }),
      { code: 'INVALID_PATCH' },
    )
  })

  it('replaces an artifact built again under the same id', async (t) => {
    const { store, session } = await openSession(t)
    const artifact = {
      id: 'spectrum',
      title: 'Spectrum',
      kind: 'chart',
      status: 'built',
      bundlePath: 'sessions/x/artifacts/spectrum.js',
    } as const

    await store.putArtifact(session.id, artifact)
    const after = await store.putArtifact(session.id, { ...artifact, title: 'Spectrum, fixed' })

    assert.equal(after.artifacts.length, 1)
    assert.equal(after.artifacts[0]?.title, 'Spectrum, fixed')
  })

  it('puts a log entry last and gives it an id', async (t) => {
    const { store, session } = await openSession(t)

    await store.appendLog(session.id, { role: 'user', text: 'why sines?', at: 130 })
    const after = await store.appendLog(session.id, {
      role: 'agent',
      text: 'Because they are the eigenfunctions.',
      at: 130,
      spoken: true,
    })

    const entry = after.log.at(-1)
    assert.equal(after.log.length, 2)
    assert.equal(entry?.role, 'agent')
    assert.equal(entry?.spoken, true)
    assert.match(entry?.id ?? '', /\S/)
    assert.notEqual(entry?.id, after.log[0]?.id)
  })

  it('loses nothing when both faces write at once', async (t) => {
    const { home, store, session } = await openSession(t)
    const count = 25

    await Promise.all([
      ...Array.from({ length: count }, (_, i) =>
        store.appendLog(session.id, { role: 'user', text: `q${i}`, at: i }),
      ),
      ...Array.from({ length: count }, (_, i) =>
        store.appendConcepts(session.id, [
          { id: `c${i}`, label: `Concept ${i}`, kind: 'definition', startsAt: i, endsAt: i + 1 },
        ]),
      ),
    ])

    const written = store.get(session.id)
    assert.equal(written.log.length, count)
    assert.equal(written.concepts.length, count)

    await store.close()
    const reopened = createStore({ home })
    t.after(() => reopened.close())
    assert.deepEqual(reopened.get(session.id), written)
  })
})
