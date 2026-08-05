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
