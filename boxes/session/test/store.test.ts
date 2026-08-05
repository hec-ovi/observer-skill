import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { createStore } from '#session'
import { SOURCE, newHome, openSession } from '../fixtures.ts'

describe('the record', () => {
  it('starts in feed with the settings filled in', async (t) => {
    const { session } = await openSession(t, { theme: 'dark' })

    assert.equal(session.phase, 'feed')
    assert.equal(session.settings.theme, 'dark')
    assert.equal(session.settings.language, 'en')
    assert.equal(session.settings.voiceOut.provider, 'web-speech')
    assert.deepEqual(session.concepts, [])
    assert.equal(session.cursor, 0)
    assert.equal(session.userPrompt, null)
    assert.equal(session.source.title, SOURCE.title)
  })

  it('carries what the user wants from the video', async (t) => {
    const home = await newHome(t)
    const store = createStore({ home })
    t.after(() => store.close())

    const session = await store.create({
      source: SOURCE,
      settings: {},
      userPrompt: 'I only care about the maths',
    })
    assert.equal(session.userPrompt, 'I only care about the maths')
  })

  it('gives every session an id that is safe as a path and a URL segment', async (t) => {
    const { session } = await openSession(t)

    assert.match(session.id, /^[a-z0-9]+$/)
    assert.equal(encodeURIComponent(session.id), session.id)
    assert.ok(session.id.length <= 32)
  })

  it('refuses to hand out a session it does not have', async (t) => {
    const { store } = await openSession(t)

    assert.throws(() => store.get('nope'), { code: 'UNKNOWN_SESSION' })
  })

  it('lists the newest session first', async (t) => {
    const home = await newHome(t)
    const store = createStore({ home })
    t.after(() => store.close())

    const first = await store.create({ source: SOURCE, settings: {} })
    const second = await store.create({ source: SOURCE, settings: {} })

    assert.deepEqual(
      store.list().map((s) => s.id),
      [second.id, first.id],
    )
  })

  it('hands out a frozen record, so a reader cannot corrupt the store', async (t) => {
    const { store, session } = await openSession(t)

    assert.throws(() => {
      store.get(session.id).concepts.push({
        id: 'x',
        label: 'x',
        kind: 'definition',
        startsAt: 0,
        endsAt: 1,
        summary: '',
        notes: [],
        artifactIds: [],
      })
    }, TypeError)
  })
})

describe('persistence', () => {
  it('reads back after a restart with the same record and the same cursor', async (t) => {
    const home = await newHome(t)
    const store = createStore({ home })
    const created = await store.create({ source: SOURCE, settings: {} })

    await store.advance(created.id, 'transcribing')
    await store.appendLog(created.id, { role: 'user', text: 'why?', at: 42 })
    await store.push(created.id, { kind: 'ask', at: 42, text: 'why?', via: 'text' })
    await store.touchAgent(created.id)
    const before = store.get(created.id)
    await store.close()

    const reopened = createStore({ home })
    t.after(() => reopened.close())

    assert.deepEqual(reopened.get(created.id), before)
    assert.equal(reopened.get(created.id).cursor, before.cursor)
  })

  it('writes whole JSON, in the session directory the transcript shares', async (t) => {
    const { home, store, session } = await openSession(t)
    await store.progress(session.id, { step: 'transcribing', done: 3, total: 10 })

    const file = join(home, 'sessions', session.id, 'session.json')
    const onDisk: unknown = JSON.parse(await readFile(file, 'utf8'))

    assert.deepEqual(onDisk, store.get(session.id))
  })
})
