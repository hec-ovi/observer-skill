import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { promisify } from 'node:util'
import { createStore } from '#session'
import { SOURCE, newHome, openSession } from '../fixtures.ts'

const run = promisify(execFile)
const ONE_SHOT = join(import.meta.dirname, '..', 'one-shot.ts')

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

  it('lands the write for a caller that creates a session and then exits', async (t) => {
    const home = await newHome(t)

    await run(process.execPath, [ONE_SHOT, home])

    const [id] = await readdir(join(home, 'sessions'))
    assert.ok(id !== undefined, 'the one-shot caller left no session behind')
    const record = JSON.parse(await readFile(join(home, 'sessions', id, 'session.json'), 'utf8'))
    assert.equal((record as { id: string }).id, id)
  })
})

describe('a store that cannot write', () => {
  it('refuses to open a home it cannot create', async (t) => {
    const home = await newHome(t)
    await writeFile(join(home, 'sessions'), 'in the way')

    assert.throws(() => createStore({ home }), { code: 'STORE_UNWRITABLE' })
  })

  it('keeps no session whose first write failed', async (t) => {
    const home = await newHome(t)
    const store = createStore({ home })
    t.after(() => store.close())
    // A file where the sessions directory belongs: the record cannot reach the disk.
    await rm(join(home, 'sessions'), { recursive: true })
    await writeFile(join(home, 'sessions'), 'in the way')

    await assert.rejects(() => store.create({ source: SOURCE, settings: {} }), {
      code: 'STORE_UNWRITABLE',
    })

    assert.deepEqual(store.list(), [])
  })

  it('leaves no half-written file behind when the record cannot land', async (t) => {
    const { home, store, session } = await openSession(t)
    const dir = join(home, 'sessions', session.id)
    // A directory where the record belongs: the temp file is written, the rename fails.
    await rm(join(dir, 'session.json'))
    await mkdir(join(dir, 'session.json'))

    await assert.rejects(() => store.patch(session.id, { position: { time: 42 } }), {
      code: 'STORE_UNWRITABLE',
    })

    assert.deepEqual(await readdir(dir), ['session.json'])
  })
})
