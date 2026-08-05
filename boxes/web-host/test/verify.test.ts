import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { isObserverError } from '#errors'
import { FakeStore, makeSession, openSse, postJson, startHost } from '../fixtures.ts'

const running = await startHost()
after(() => running.stop())

test('verifying with no page open is PAGE_NOT_OPEN', async () => {
  await assert.rejects(
    () => running.host.verify({ sessionId: 's1', artifactId: 'a1' }),
    (error: unknown) => isObserverError(error) && error.code === 'PAGE_NOT_OPEN',
  )
})

test('verify signals the page and resolves with what it posts back', async () => {
  const client = await openSse(`${running.base}/live/s1`)
  const result = running.host.verify({ sessionId: 's1', artifactId: 'a1', timeoutMs: 2_000 })

  const signalled = await client.waitFor('verify')
  const asked = signalled.data as { requestId: string; url: string; timeoutMs: number }
  assert.equal(asked.url, `${running.base}/api/artifact/s1/a1`)
  assert.equal(asked.timeoutMs, 2_000)

  const answer = await postJson(`${running.base}/live/s1/event`, {
    type: 'verify-result',
    requestId: asked.requestId,
    ok: true,
    errors: [],
    size: { width: 640, height: 360 },
    snapshot: 'data:image/png;base64,AAAA',
  })
  assert.equal(answer.status, 202)

  assert.deepEqual(await result, {
    ok: true,
    errors: [],
    size: { width: 640, height: 360 },
    snapshot: 'data:image/png;base64,AAAA',
  })
  client.vanish()
})

test('a verification the page never answers comes back failed, not hung', async () => {
  const client = await openSse(`${running.base}/live/s1`)
  const result = await running.host.verify({
    sessionId: 's1',
    artifactId: 'a1',
    timeoutMs: 30,
  })

  assert.equal(result.ok, false)
  assert.equal(result.errors.length, 1)
  assert.deepEqual(result.size, { width: 0, height: 0 })
  assert.equal(result.snapshot, null)
  client.vanish()
})

test('asking again for the same artifact leaves only one verification pending', async () => {
  const client = await openSse(`${running.base}/live/s1`)
  const first = running.host.verify({ sessionId: 's1', artifactId: 'a1', timeoutMs: 5_000 })
  const second = running.host.verify({ sessionId: 's1', artifactId: 'a1', timeoutMs: 30 })

  const superseded = await first
  assert.equal(superseded.ok, false)
  assert.match(superseded.errors[0] ?? '', /superseded/i)
  assert.equal((await second).ok, false)
  client.vanish()
})

test('two sessions holding the same artifact id verify without cancelling each other', async () => {
  // Artifact ids are chosen per session, so `revenue-chart` in two sessions is two artifacts.
  const store = new FakeStore([makeSession({ id: 'sA' }), makeSession({ id: 'sB' })])
  const pair = await startHost({ store })
  try {
    const pageA = await openSse(`${pair.base}/live/sA`)
    const pageB = await openSse(`${pair.base}/live/sB`)

    const runA = pair.host.verify({ sessionId: 'sA', artifactId: 'revenue-chart', timeoutMs: 5_000 })
    const runB = pair.host.verify({ sessionId: 'sB', artifactId: 'revenue-chart', timeoutMs: 5_000 })

    const askedA = (await pageA.waitFor('verify')).data as { requestId: string }
    const askedB = (await pageB.waitFor('verify')).data as { requestId: string }

    const answer = await postJson(`${pair.base}/live/sA/event`, {
      type: 'verify-result',
      requestId: askedA.requestId,
      ok: true,
      errors: [],
      size: { width: 320, height: 180 },
      snapshot: null,
    })
    assert.equal(answer.status, 202)

    assert.deepEqual(await runA, {
      ok: true,
      errors: [],
      size: { width: 320, height: 180 },
      snapshot: null,
    })

    await postJson(`${pair.base}/live/sB/event`, {
      type: 'verify-result',
      requestId: askedB.requestId,
      ok: false,
      errors: ['it drew nothing'],
      size: { width: 0, height: 0 },
      snapshot: null,
    })
    assert.deepEqual((await runB).errors, ['it drew nothing'])

    pageA.vanish()
    pageB.vanish()
  } finally {
    await pair.stop()
  }
})
