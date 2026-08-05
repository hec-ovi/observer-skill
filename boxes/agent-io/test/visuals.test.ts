/**
 * `build` and `link`: the compile, the run in the user's own page, the picture that comes
 * back, and the rule that an answer is never blocked on a compiler.
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { describe, it } from 'node:test'
import { CONCEPT, SNAPSHOT_PNG, goLive, openAgentIo, openSession, seed } from '../fixtures.ts'

const SOURCE = `
export const meta = { title: 'Bins over time', kind: 'chart' }
export function mount(el) { el.textContent = 'drawn'; return () => {} }
`

const CHART = { id: 'bins', title: 'Bins over time', kind: 'chart', source: SOURCE }

describe('build', () => {
  it('compiles, verifies in the page, stores, and hands back the picture', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)

    const result = await harness.call('build', CHART)

    assert.equal(result.isError, false)
    assert.equal(result.body['ok'], true)
    assert.equal(result.body['artifactId'], 'bins')
    assert.deepEqual(result.body['size'], { width: 800, height: 450 })
    // The first build is what opens the visual pass.
    assert.equal(result.body['phase'], 'building')

    const stored = harness.session().artifacts[0]
    assert.equal(stored?.status, 'built')
    assert.ok(stored?.snapshotPath)
    assert.ok(existsSync(String(result.body['snapshotPath'])))
  })

  it('returns the snapshot as an image, so the agent looks at what it made', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)

    const result = await harness.call('build', CHART)

    const image = result.content.find((block) => block.type === 'image')
    assert.ok(image, 'the result carries an image block')
    assert.equal(image['mimeType'], 'image/png')
    assert.equal(image['data'], SNAPSHOT_PNG)
  })

  it('writes the caption and the narration onto the record, for the page to read', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)

    await harness.call('build', {
      ...CHART,
      caption: 'Values are illustrative.',
      narration: 'Watch the low bins fill first, then the tail.',
    })
    await harness.call('build', { ...CHART, id: 'plain' })

    const [marked, plain] = harness.session().artifacts
    assert.equal(marked?.caption, 'Values are illustrative.')
    assert.equal(marked?.narration, 'Watch the low bins fill first, then the tail.')
    assert.equal(plain?.caption, null)
    assert.equal(plain?.narration, null)
  })

  it('stores nothing when the module does not compile', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)
    harness.artifact.errors = [
      {
        stage: 'check',
        message: 'import "lodash" is not available',
        line: 2,
        column: 8,
        fix: 'Only echarts, d3 and katex exist. Write it yourself or drop it.',
      },
    ]

    const result = await harness.call('build', CHART)

    assert.equal(result.body['ok'], false)
    const errors = result.body['errors'] as { line: number; fix: string }[]
    assert.equal(errors[0]?.line, 2)
    assert.match(String(errors[0]?.fix), /echarts/)
    assert.equal(harness.session().artifacts.length, 0)
  })

  it('leaves nothing on the record when the visual fails in the page', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)
    harness.host.outcome = {
      ok: false,
      errors: ['TypeError: el.getContext is not a function'],
      size: { width: 0, height: 0 },
      snapshot: null,
    }

    const result = await harness.call('build', CHART)

    assert.equal(result.body['ok'], false)
    const errors = result.body['errors'] as { stage: string; message: string }[]
    assert.equal(errors[0]?.stage, 'verify')
    assert.equal(harness.session().artifacts[0]?.status, 'failed')
    assert.equal(harness.session().artifacts.filter((a) => a.status === 'built').length, 0)
  })

  it('refuses to verify with no page connected', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)
    harness.host.pageOpen = false

    const result = await harness.call('build', CHART)

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'PAGE_NOT_OPEN')
    assert.equal(harness.session().artifacts.length, 0)
  })

  it('refuses during a live session until an answer has gone out', async (t) => {
    const harness = await openAgentIo(t)
    await goLive(harness)

    const blocked = await harness.call('build', CHART)
    assert.equal(blocked.isError, true)
    assert.equal((blocked.body['error'] as { code: string }).code, 'WRONG_PHASE')
    assert.match((blocked.body['error'] as { hint: string }).hint, /`say` first/)

    const unknown = await harness.call('build', { ...CHART, afterEntryId: 'never-sent' })
    assert.equal((unknown.body['error'] as { code: string }).code, 'WRONG_PHASE')

    const said = await harness.call('say', { text: 'A bin is one output slot.' })
    const after = await harness.call('build', {
      ...CHART,
      afterEntryId: String(said.body['entryId']),
    })
    assert.equal(after.body['ok'], true)
  })

  it('refuses while the transcript is still being made', async (t) => {
    const harness = await openAgentIo(t)
    const session = await seed(harness, 'transcribing')

    const result = await harness.call('build', { ...CHART, sessionId: session.id })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'WRONG_PHASE')
    assert.equal(result.body['next'], 'status')
  })
})

describe('link', () => {
  it('binds a visual to its concept and its stretch of video', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)
    const written = await harness.call('concepts', { concepts: [CONCEPT] })
    const conceptId = (written.body['written'] as { id: string }[])[0]?.id ?? ''
    await harness.call('build', CHART)

    const result = await harness.call('link', {
      artifactId: 'bins',
      conceptId,
      startsAt: 100,
      endsAt: 400,
    })

    assert.equal(result.isError, false)
    assert.equal(result.body['conceptId'], conceptId)
    assert.deepEqual(harness.session().concepts[0]?.artifactIds, ['bins'])
    assert.equal(harness.session().artifacts[0]?.startsAt, 100)
  })

  it('refuses half a range instead of dropping the range already stored', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)
    const written = await harness.call('concepts', { concepts: [CONCEPT] })
    const conceptId = (written.body['written'] as { id: string }[])[0]?.id ?? ''
    await harness.call('build', { ...CHART, conceptId, startsAt: 600, endsAt: 900 })

    const result = await harness.call('link', { artifactId: 'bins', conceptId, startsAt: 700 })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'INVALID_PATCH')
    assert.equal(harness.session().artifacts[0]?.startsAt, 600)
    assert.equal(harness.session().artifacts[0]?.endsAt, 900)

    const built = await harness.call('build', { ...CHART, id: 'half', conceptId, endsAt: 700 })
    assert.equal(built.isError, true)
    assert.equal((built.body['error'] as { code: string }).code, 'INVALID_PATCH')
    assert.equal(harness.session().artifacts.length, 1)
  })

  it('refuses before anything has been built', async (t) => {
    const harness = await openAgentIo(t)
    const session = await seed(harness, 'researching')

    const result = await harness.call('link', {
      sessionId: session.id,
      artifactId: 'bins',
      conceptId: 'frequency-bin',
    })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'WRONG_PHASE')
    assert.equal(result.body['next'], 'concepts')
  })
})
