/**
 * The two preparation switches, which decide how far a session goes and what it is allowed
 * to make. They are the user's, they live on the record, and the page can flip them at any
 * moment, so every read of them is a read of the record as it is now.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CONCEPT, VIDEO_URL, openAgentIo, openSession, until } from '../fixtures.ts'

const CHART = {
  id: 'bins',
  title: 'Bins over time',
  kind: 'chart',
  source: `
export const meta = { title: 'Bins over time', kind: 'chart' }
export function mount(el) { el.textContent = 'drawn'; return () => {} }
`,
}

describe('the preparation switches', () => {
  it('goes straight to the visual pass when extra knowledge is off', async (t) => {
    const harness = await openAgentIo(t)

    const session = await openSession(harness, { extraKnowledge: false })

    assert.equal(session.phase, 'building')
  })

  it('goes straight to ready when both switches are off', async (t) => {
    const harness = await openAgentIo(t)

    const session = await openSession(harness, { extraKnowledge: false, toolkit: false })

    assert.equal(session.phase, 'ready')
  })

  it('reads the switches at the moment it moves, not at the moment it opened', async (t) => {
    const harness = await openAgentIo(t)
    harness.transcript.hold()

    const opened = await harness.call('open', { url: VIDEO_URL })
    const id = String(opened.body['sessionId'])
    await until(() => harness.transcript.started, 'the transcription run to start')

    // What the page does when the user flips a switch while the words are still coming in.
    await harness.store.patch(id, { settings: { extraKnowledge: false, toolkit: false } })
    harness.transcript.release()

    await until(() => harness.store.get(id).phase !== 'transcribing', 'the transcript')
    const session = harness.store.get(id)
    assert.equal(session.phase, 'ready')
    assert.equal(session.error, null)
  })

  it('refuses to build a visual for a session that turned visuals off', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness, { toolkit: false })

    const refused = await harness.call('build', CHART)
    assert.equal(refused.isError, true)
    assert.equal((refused.body['error'] as { code: string }).code, 'WRONG_PHASE')
    assert.match((refused.body['error'] as { hint: string }).hint, /`ready`/)
    assert.equal(harness.session().phase, 'researching')
    assert.equal(harness.session().artifacts.length, 0)

    // The same refusal once preparation is closed, where the phase alone would allow it.
    await harness.call('concepts', { concepts: [CONCEPT] })
    await harness.call('ready')

    const again = await harness.call('build', CHART)
    assert.equal(again.isError, true)
    assert.equal((again.body['error'] as { code: string }).code, 'WRONG_PHASE')
    assert.equal(harness.session().artifacts.length, 0)
  })
})
