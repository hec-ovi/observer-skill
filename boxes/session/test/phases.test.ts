import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { createStore } from '#session'
import type { SubscriberMessage } from '#session'
import { SOURCE, newHome, openSession } from '../fixtures.ts'

/** The presence window the contract promises: ninety seconds since the last tool call. */
const PRESENCE_MS = 90_000

/** One turn of the event loop, so a queued write and its patch have been applied. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

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

  it('detaches on its own once the window passes, and the drop reaches subscribers', async (t) => {
    const { store, session } = await openSession(t)
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })

    const touching = store.touchAgent(session.id)
    await settle()
    t.mock.timers.tick(20)
    await touching

    const messages: SubscriberMessage[] = []
    store.subscribe(session.id, (message) => messages.push(message))
    t.mock.timers.tick(PRESENCE_MS)
    await settle()

    assert.equal(store.get(session.id).agent.attached, false)
    assert.ok(
      messages.some((m) => m.type === 'patch' && m.patch.agent?.attached === false),
      'subscribers were not told the agent went quiet',
    )
    t.mock.timers.reset()
  })

  it('keeps the agent attached while tool calls keep coming', async (t) => {
    const { store, session } = await openSession(t)
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })

    for (let elapsed = 0; elapsed < PRESENCE_MS * 2; elapsed += PRESENCE_MS / 2) {
      const touching = store.touchAgent(session.id)
      await settle()
      t.mock.timers.tick(20)
      await touching
      t.mock.timers.tick(PRESENCE_MS / 2)
      await settle()
    }

    assert.equal(store.get(session.id).agent.attached, true)
    t.mock.timers.reset()
  })

  it('comes back detached when the last tool call is older than the window', async (t) => {
    const home = await newHome(t)
    const store = createStore({ home })
    const created = await store.create({ source: SOURCE, settings: {} })
    await store.touchAgent(created.id)
    await store.close()

    const file = join(home, 'sessions', created.id, 'session.json')
    const record = JSON.parse(await readFile(file, 'utf8')) as { agent: { lastSeen: string } }
    record.agent.lastSeen = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    await writeFile(file, JSON.stringify(record), 'utf8')

    const reopened = createStore({ home })
    t.after(() => reopened.close())

    assert.equal(reopened.get(created.id).agent.attached, false)
  })
})
