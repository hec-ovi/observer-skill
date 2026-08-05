import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { describe, it } from 'node:test'
import { createStore } from '#session'
import { SOURCE, newHome, openSession } from '../fixtures.ts'

const ASK = { kind: 'ask', at: 130, text: 'why sines?', via: 'text' } as const

describe('the inbox', () => {
  it('delivers an event pushed while nobody was waiting', async (t) => {
    const { store, session } = await openSession(t)

    const cursor = await store.push(session.id, ASK)
    const taken = await store.take(session.id, { after: 0, timeoutMs: 0 })

    assert.equal(cursor, 1)
    assert.equal(taken.cursor, 1)
    assert.equal(taken.events.length, 1)
    assert.equal(taken.events[0]?.kind, 'ask')
    assert.equal(taken.events[0]?.cursor, 1)
  })

  it('wakes a waiting take when the event arrives', async (t) => {
    const { store, session } = await openSession(t)

    const waiting = store.take(session.id, { after: 0, timeoutMs: 2_000 })
    await store.push(session.id, { kind: 'pause', at: 12 })
    const taken = await waiting

    assert.equal(taken.events.length, 1)
    assert.equal(taken.events[0]?.kind, 'pause')
  })

  it('never delivers the same event twice to a caller carrying its cursor', async (t) => {
    const { store, session } = await openSession(t)

    await store.push(session.id, ASK)
    const first = await store.take(session.id, { after: 0, timeoutMs: 0 })

    await store.push(session.id, { kind: 'seek', at: 300 })
    const second = await store.take(session.id, { after: first.cursor, timeoutMs: 0 })

    assert.equal(second.events.length, 1)
    assert.equal(second.events[0]?.kind, 'seek')
    assert.equal(second.cursor, 2)

    const third = await store.take(session.id, { after: second.cursor, timeoutMs: 5 })
    assert.deepEqual(third, { events: [], cursor: second.cursor })
  })

  it('resolves empty on timeout rather than throwing', async (t) => {
    const { store, session } = await openSession(t)

    const taken = await store.take(session.id, { after: 4, timeoutMs: 15 })

    assert.deepEqual(taken, { events: [], cursor: 4 })
  })

  it('resolves empty on an aborted signal and leaves no listener behind', async (t) => {
    const { store, session } = await openSession(t)
    const controller = new AbortController()

    const waiting = store.take(session.id, {
      after: 0,
      timeoutMs: 60_000,
      signal: controller.signal,
    })
    controller.abort()

    assert.deepEqual(await waiting, { events: [], cursor: 0 })
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
  })

  it('keeps the cursor on the record, so a restart never reuses one', async (t) => {
    const { store, session } = await openSession(t)

    await store.push(session.id, ASK)
    await store.push(session.id, { kind: 'ready', at: 0 })

    assert.equal(store.get(session.id).cursor, 2)
  })

  it('starts a restart with an empty inbox and the cursor where it left off', async (t) => {
    const home = await newHome(t)
    const store = createStore({ home })
    const created = await store.create({ source: SOURCE, settings: {} })
    await store.push(created.id, ASK)
    await store.close()

    const reopened = createStore({ home })
    t.after(() => reopened.close())

    assert.deepEqual(await reopened.take(created.id, { after: 0, timeoutMs: 0 }), {
      events: [],
      cursor: 0,
    })
    assert.equal(await reopened.push(created.id, { kind: 'ready', at: 0 }), 2)
  })

  it('validates what is pushed', async (t) => {
    const { store, session } = await openSession(t)

    await assert.rejects(() => store.push(session.id, { kind: 'ask', at: 1, text: '' }), {
      code: 'INVALID_PATCH',
    })
  })

  it('does not answer for a session it does not have', async (t) => {
    const { store } = await openSession(t)

    await assert.rejects(() => store.take('ghost', { after: 0, timeoutMs: 0 }), {
      code: 'UNKNOWN_SESSION',
    })
  })
})
