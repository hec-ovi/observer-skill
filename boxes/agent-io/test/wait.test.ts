/**
 * `wait` is the session loop, so the three things that would break it: an event that
 * arrived while nobody was listening, the same event arriving twice, and a call the client
 * cancelled while it was blocked.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { goLive, goReady, openAgentIo } from '../fixtures.ts'

describe('wait', () => {
  it('delivers a question that was asked while nobody was waiting', async (t) => {
    const harness = await openAgentIo(t)
    const session = await goLive(harness)

    // Nothing is blocked on the inbox at this point.
    await harness.store.push(session.id, { kind: 'ask', text: 'wait, what', at: 42 })

    const started = Date.now()
    const result = await harness.call('wait', { timeoutMs: 30_000 })

    assert.ok(Date.now() - started < 5_000, 'a pending question does not wait for the timeout')
    assert.equal((result.body['events'] as unknown[]).length, 1)
  })

  it('never hands the same event over twice', async (t) => {
    const harness = await openAgentIo(t)
    const session = await goLive(harness)
    await harness.store.push(session.id, { kind: 'ask', text: 'first', at: 10 })

    const first = await harness.call('wait', { timeoutMs: 1000 })
    assert.equal((first.body['events'] as { text: string }[])[0]?.text, 'first')

    // The cursor is remembered per session, so a second call that names none resumes.
    const second = await harness.call('wait', { timeoutMs: 1 })
    assert.equal(second.body['idle'], true)
    assert.deepEqual(second.body['events'], [])
    assert.equal(second.body['cursor'], first.body['cursor'])

    await harness.store.push(session.id, { kind: 'ask', text: 'second', at: 20 })
    const third = await harness.call('wait', { timeoutMs: 1000 })
    assert.equal((third.body['events'] as { text: string }[])[0]?.text, 'second')
  })

  it('returns as soon as the call is cancelled, without waiting out its timeout', async (t) => {
    const harness = await openAgentIo(t)
    await goLive(harness)

    const abort = new AbortController()
    const started = Date.now()
    const blocked = harness.client.callTool(
      { name: 'wait', arguments: { timeoutMs: 60_000 } },
      { signal: abort.signal, timeout: 60_000 },
    )
    setTimeout(() => abort.abort(), 50)

    await assert.rejects(blocked)
    assert.ok(Date.now() - started < 5_000, 'the block ended with the call')

    // The waiter left nothing behind: the next call takes the slot and answers.
    const after = await harness.call('wait', { timeoutMs: 1 })
    assert.equal(after.body['idle'], true)
  })

  it('starts the session once when two waits arrive together', async (t) => {
    const harness = await openAgentIo(t)
    const session = await goReady(harness)

    const [first, second] = await Promise.all([
      harness.call('wait', { timeoutMs: 1 }),
      harness.call('wait', { timeoutMs: 1 }),
    ])

    assert.equal(first.isError, false, JSON.stringify(first.body))
    assert.equal(second.isError, false, JSON.stringify(second.body))
    assert.equal(first.body['idle'], true)
    assert.equal(second.body['idle'], true)
    assert.equal(harness.store.get(session.id).phase, 'live')
  })

  it('holds one waiter per session, and the newer call takes the slot', async (t) => {
    const harness = await openAgentIo(t)
    const session = await goLive(harness)

    const first = harness.call('wait', { timeoutMs: 30_000 })
    await new Promise((resolve) => setTimeout(resolve, 20))
    const second = harness.call('wait', { timeoutMs: 30_000 })

    const superseded = await first
    assert.equal(superseded.body['idle'], true)

    await harness.store.push(session.id, { kind: 'pause', at: 90 })
    const answered = await second
    assert.equal((answered.body['events'] as { kind: string }[])[0]?.kind, 'pause')
    assert.equal(answered.body['next'], 'wait')
  })
})
