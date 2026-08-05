import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SubscriberMessage } from '#session'
import { openSession } from '../fixtures.ts'

function collect(): { messages: SubscriberMessage[]; listener: (m: SubscriberMessage) => void } {
  const messages: SubscriberMessage[] = []
  return { messages, listener: (message) => messages.push(message) }
}

describe('subscribers', () => {
  it('receive only the part of the record that moved', async (t) => {
    const { store, session } = await openSession(t)
    const { messages, listener } = collect()
    store.subscribe(session.id, listener)

    await store.patch(session.id, { position: { time: 42 } })

    const patch = messages.find((m) => m.type === 'patch')
    assert.deepEqual(patch?.patch.position, { time: 42 })
    assert.equal(patch?.patch.source, undefined)
    assert.equal(patch?.patch.concepts, undefined)
    assert.ok(patch?.patch.updatedAt !== undefined)
  })

  it('are told nothing about what happened before they arrived', async (t) => {
    const { store, session } = await openSession(t)
    await store.patch(session.id, { position: { time: 9 } })

    const { messages, listener } = collect()
    store.subscribe(session.id, listener)

    assert.deepEqual(messages, [])
  })

  it('get a phase message when the phase or the progress moves', async (t) => {
    const { store, session } = await openSession(t)
    const { messages, listener } = collect()
    store.subscribe(session.id, listener)

    await store.advance(session.id, 'transcribing')
    await store.progress(session.id, { done: 4, total: 10, message: 'minutes' })

    const phases = messages.filter((m) => m.type === 'phase')
    assert.equal(phases.length, 2)
    assert.equal(phases[0]?.phase, 'transcribing')
    assert.equal(phases[1]?.progress.done, 4)
  })

  it('get signals, and signals are never written down', async (t) => {
    const { store, session } = await openSession(t)
    const { messages, listener } = collect()
    store.subscribe(session.id, listener)

    store.signal(session.id, { type: 'show', artifactId: 'spectrum' })

    assert.deepEqual(messages, [
      { type: 'signal', signal: { type: 'show', artifactId: 'spectrum' } },
    ])
    assert.equal(store.get(session.id).updatedAt, session.updatedAt)
  })

  it('stop hearing anything once they unsubscribe', async (t) => {
    const { store, session } = await openSession(t)
    const { messages, listener } = collect()
    const stop = store.subscribe(session.id, listener)

    stop()
    await store.patch(session.id, { position: { time: 3 } })

    assert.deepEqual(messages, [])
  })

  it('do not take each other down when one throws', async (t) => {
    const { store, session } = await openSession(t)
    const { messages, listener } = collect()
    store.subscribe(session.id, () => {
      throw new Error('this subscriber is broken')
    })
    store.subscribe(session.id, listener)

    await store.patch(session.id, { position: { time: 7 } })

    assert.equal(messages.length, 1)
  })

  it('refuse to subscribe to a session that does not exist', async (t) => {
    const { store } = await openSession(t)

    assert.throws(() => store.subscribe('ghost', () => {}), { code: 'UNKNOWN_SESSION' })
  })
})
