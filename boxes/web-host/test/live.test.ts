import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { openSse, postJson, startHost, waitUntil } from '../fixtures.ts'

const running = await startHost({ heartbeatMs: 25 })
after(() => running.stop())

test('a patch reaches an open stream, with an id', async () => {
  const client = await openSse(`${running.base}/live/s1`)
  await running.store.patch('s1', { position: { time: 42, state: 'paused' } })

  const event = await client.waitFor('patch')
  assert.deepEqual(event.data, { position: { time: 42, state: 'paused' } })
  assert.equal(typeof event.id, 'string')
  client.vanish()
})

test('a phase move reaches the stream as its own event', async () => {
  const client = await openSse(`${running.base}/live/s1`)
  running.store.movePhase('s1', 'building', {
    step: 'artifact',
    done: 1,
    total: 3,
    message: 'drawing the chart',
  })

  const event = await client.waitFor('phase')
  assert.deepEqual(event.data, {
    phase: 'building',
    progress: { step: 'artifact', done: 1, total: 3, message: 'drawing the chart' },
  })
  client.vanish()
})

test('a say signal reaches the stream with the line and how to read it', async () => {
  const client = await openSse(`${running.base}/live/s1`)
  running.store.signal('s1', {
    type: 'say',
    entryId: 'e1',
    text: 'watch the dip here',
    speak: true,
    artifactId: 'a1',
  })

  const event = await client.waitFor('say')
  assert.deepEqual(event.data, {
    entryId: 'e1',
    text: 'watch the dip here',
    speak: true,
    artifactId: 'a1',
  })
  client.vanish()
})

test('show names the artifact and hide carries nothing', async () => {
  const client = await openSse(`${running.base}/live/s1`)
  running.store.signal('s1', { type: 'show', artifactId: 'a1' })
  running.store.signal('s1', { type: 'hide' })

  assert.deepEqual((await client.waitFor('show')).data, { artifactId: 'a1' })
  assert.deepEqual((await client.waitFor('hide')).data, {})
  client.vanish()
})

test('the stream announces itself as an unbuffered event stream', async () => {
  const client = await openSse(`${running.base}/live/s1`)
  assert.equal(client.headers['content-type'], 'text/event-stream; charset=utf-8')
  assert.equal(client.headers['cache-control'], 'no-cache, no-transform')
  assert.equal(client.headers['x-accel-buffering'], 'no')
  client.vanish()
})

test('a heartbeat keeps the stream alive on its own', async () => {
  const client = await openSse(`${running.base}/live/s1`)
  const ping = await client.waitFor('ping')
  assert.equal(typeof (ping.data as { at: number }).at, 'number')
  client.vanish()
})

test('a socket that vanishes without a close frame unsubscribes', async () => {
  const before = running.store.unsubscribed
  const client = await openSse(`${running.base}/live/s1`)
  await running.store.patch('s1', { position: { time: 1, state: 'playing' } })
  await client.waitFor('patch')

  client.vanish()
  await waitUntil(() => running.store.unsubscribed > before)
})

test('an ask goes into the session inbox', async () => {
  const answer = await postJson(`${running.base}/live/s1/event`, {
    type: 'ask',
    text: 'why is it flat here?',
    at: 128,
    via: 'voice',
  })

  assert.equal(answer.status, 202)
  assert.deepEqual(running.store.inbox.at(-1), {
    kind: 'ask',
    text: 'why is it flat here?',
    at: 128,
    via: 'voice',
  })
})

test('a position updates the record and is not queued', async () => {
  const queued = running.store.inbox.length
  const answer = await postJson(`${running.base}/live/s1/event`, {
    type: 'position',
    time: 90,
    state: 'playing',
  })

  assert.equal(answer.status, 202)
  assert.deepEqual(running.store.patches.at(-1), { position: { time: 90, state: 'playing' } })
  assert.equal(running.store.inbox.length, queued)
})

test('a settings change lands on the record and in the inbox', async () => {
  const answer = await postJson(`${running.base}/live/s1/event`, {
    type: 'settings',
    at: 30,
    settings: { theme: 'dark' },
  })

  assert.equal(answer.status, 202)
  assert.deepEqual(running.store.patches.at(-1), { settings: { theme: 'dark' } })
  assert.deepEqual(running.store.inbox.at(-1), {
    kind: 'settings',
    at: 30,
    settings: { theme: 'dark' },
  })
})

test('a body that is not a live event is refused with the shared error shape', async () => {
  const answer = await postJson(`${running.base}/live/s1/event`, { type: 'shout', text: 'hi' })

  assert.equal(answer.status, 400)
  const body = answer.body as { code: string; message: string; hint: string }
  assert.equal(body.code, 'INVALID_PATCH')
  assert.ok(body.message.length > 0)
  assert.ok(body.hint.length > 0)
})

test('a session that does not exist has no channel', async () => {
  const answer = await fetch(`${running.base}/live/nope`, {
    headers: { accept: 'text/event-stream' },
  })
  assert.equal(answer.status, 404)
  assert.equal(((await answer.json()) as { code: string }).code, 'UNKNOWN_SESSION')
})
