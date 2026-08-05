import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openSession } from '../fixtures.ts'

describe('the phase machine', () => {
  it('walks feed to live when both preparation phases are on', async (t) => {
    const { store, session } = await openSession(t)

    for (const phase of ['transcribing', 'researching', 'building', 'ready', 'live'] as const) {
      const moved = await store.advance(session.id, phase)
      assert.equal(moved.phase, phase)
      assert.equal(moved.progress.step, phase)
    }
  })

  it('refuses a move the table does not have', async (t) => {
    const { store, session } = await openSession(t)

    await assert.rejects(() => store.advance(session.id, 'ready'), { code: 'ILLEGAL_PHASE' })

    await store.advance(session.id, 'transcribing')
    await store.advance(session.id, 'ready')
    await store.advance(session.id, 'live')
    await assert.rejects(() => store.advance(session.id, 'ready'), { code: 'ILLEGAL_PHASE' })
  })

  it('skips researching when extra knowledge is off', async (t) => {
    const { store, session } = await openSession(t, { extraKnowledge: false })
    await store.advance(session.id, 'transcribing')

    await assert.rejects(() => store.advance(session.id, 'researching'), { code: 'ILLEGAL_PHASE' })
    assert.equal((await store.advance(session.id, 'building')).phase, 'building')
  })

  it('skips building when the toolkit is off', async (t) => {
    const { store, session } = await openSession(t, { toolkit: false })
    await store.advance(session.id, 'transcribing')
    await store.advance(session.id, 'researching')

    await assert.rejects(() => store.advance(session.id, 'building'), { code: 'ILLEGAL_PHASE' })
    assert.equal((await store.advance(session.id, 'ready')).phase, 'ready')
  })

  it('clears the recorded failure when the phase moves on', async (t) => {
    const { store, session } = await openSession(t)
    await store.advance(session.id, 'transcribing')
    await store.fail(session.id, { code: 'TRANSCRIPT_FAILED', message: 'timed out', hint: 'retry' })

    const moved = await store.advance(session.id, 'researching')

    assert.equal(moved.error, null)
  })
})

describe('agent presence', () => {
  it('attaches the agent and stamps when it was last seen', async (t) => {
    const { store, session } = await openSession(t)
    assert.equal(session.agent.attached, false)

    const touched = await store.touchAgent(session.id)

    assert.equal(touched.agent.attached, true)
    assert.ok(touched.agent.lastSeen !== null)
    assert.ok(Date.now() - Date.parse(touched.agent.lastSeen) < 5_000)
  })
})
