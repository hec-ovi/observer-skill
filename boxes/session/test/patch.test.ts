import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createStore } from '#session'
import type { SessionPatch } from '#session'
import { openSession } from '../fixtures.ts'

describe('patch', () => {
  it('merges objects and replaces arrays', async (t) => {
    const { store, session } = await openSession(t)

    await store.appendLog(session.id, { role: 'agent', text: 'first', at: 1 })
    const patched = await store.patch(session.id, {
      settings: { voiceOut: { voice: 'Ada' } },
      position: { time: 12.5 },
      log: [],
    })

    assert.equal(patched.settings.voiceOut.voice, 'Ada')
    assert.equal(patched.settings.voiceOut.provider, 'web-speech')
    assert.equal(patched.settings.theme, 'system')
    assert.equal(patched.position.time, 12.5)
    assert.equal(patched.position.state, 'idle')
    assert.deepEqual(patched.log, [])
  })

  it('throws INVALID_PATCH and writes nothing when the result would not validate', async (t) => {
    const { home, store, session } = await openSession(t)
    const before = store.get(session.id)

    await assert.rejects(
      () => store.patch(session.id, { position: { time: -4 } }),
      { code: 'INVALID_PATCH' },
    )
    assert.deepEqual(store.get(session.id), before)

    await store.close()
    const reopened = createStore({ home })
    t.after(() => reopened.close())
    assert.deepEqual(reopened.get(session.id), before)
  })

  it('refuses the fields the store owns', async (t) => {
    const { store, session } = await openSession(t)

    await assert.rejects(
      () => store.patch(session.id, { id: 'mine' } as unknown as SessionPatch),
      { code: 'INVALID_PATCH' },
    )
    await assert.rejects(
      () => store.patch(session.id, { phase: 'live' } as unknown as SessionPatch),
      { code: 'INVALID_PATCH' },
    )
  })

  it('leaves updatedAt alone when the patch changes nothing', async (t) => {
    const { store, session } = await openSession(t)

    const same = await store.patch(session.id, { position: { time: 0 } })

    assert.equal(same.updatedAt, session.updatedAt)
  })

  it('records a failure without moving the phase', async (t) => {
    const { store, session } = await openSession(t)
    await store.advance(session.id, 'transcribing')

    const failed = await store.fail(session.id, {
      code: 'TRANSCRIPT_FAILED',
      message: 'yt-dlp returned nothing',
      hint: 'Try the ASR endpoint.',
    })

    assert.equal(failed.phase, 'transcribing')
    assert.equal(failed.error?.code, 'TRANSCRIPT_FAILED')
  })

  it('merges progress over what is already there', async (t) => {
    const { store, session } = await openSession(t)

    await store.progress(session.id, { step: 'transcribing', done: 1, total: 30, message: 'minutes' })
    const moved = await store.progress(session.id, { done: 12 })

    assert.deepEqual(moved.progress, {
      step: 'transcribing',
      done: 12,
      total: 30,
      message: 'minutes',
    })
  })
})
