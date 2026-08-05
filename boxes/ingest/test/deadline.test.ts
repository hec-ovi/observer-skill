import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'

import { fetchWithin, withDeadline } from '../src/providers/youtube/deadline.ts'

type FetchInit = Parameters<typeof fetch>[1]

/** A request that answers only when someone cancels it. */
function stall(t: TestContext, seen: (init?: FetchInit) => void) {
  const original = globalThis.fetch
  t.after(() => {
    globalThis.fetch = original
  })
  globalThis.fetch = (_input, init) =>
    new Promise<Response>((_, reject) => {
      seen(init)
      init?.signal?.addEventListener('abort', () => reject(new Error('request aborted')))
    })
}

test('a request made under a deadline is aborted when the deadline passes', async (t) => {
  let signal: AbortSignal | null | undefined
  stall(t, (init) => {
    signal = init?.signal
  })

  await assert.rejects(
    withDeadline(25, () => fetchWithin('https://youtube.invalid/youtubei/v1/player')),
    /did not answer within 25 ms/,
  )

  assert.ok(signal instanceof AbortSignal, 'the request should carry the deadline')
  assert.equal(signal.aborted, true)
  assert.equal((signal.reason as Error).name, 'TimeoutError')
})

test('outside a deadline the fetch is the plain one', async (t) => {
  let signal: AbortSignal | null | undefined = null
  stall(t, (init) => {
    signal = init?.signal
  })

  void fetchWithin('https://youtube.invalid/youtubei/v1/player')
  assert.equal(signal, undefined)
})
