import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { TestContext } from 'node:test'

import { fetchWithin, withDeadline } from '../src/providers/youtube/deadline.ts'

type FetchInit = Parameters<typeof fetch>[1]

const PLAYER = 'https://youtube.invalid/youtubei/v1/player'

/** Answers every request with `handler`, and puts the real fetch back afterwards. */
function stubFetch(t: TestContext, handler: (init?: FetchInit) => Promise<Response>) {
  const original = globalThis.fetch
  t.after(() => {
    globalThis.fetch = original
  })
  globalThis.fetch = (_input, init) => handler(init)
}

test('a request made under a deadline is aborted when the deadline passes', async (t) => {
  let signal: AbortSignal | null | undefined
  stubFetch(
    t,
    (init) =>
      new Promise<Response>((_, reject) => {
        signal = init?.signal
        init?.signal?.addEventListener('abort', () => reject(new Error('request aborted')))
      }),
  )

  await assert.rejects(
    withDeadline(25, () => fetchWithin(PLAYER)),
    /did not answer within 25 ms/,
  )

  assert.ok(signal instanceof AbortSignal, 'the request should carry the deadline')
  assert.equal(signal.aborted, true)
  assert.equal((signal.reason as Error).name, 'TimeoutError')
})

test('outside a deadline the request carries no signal of ours', async (t) => {
  let signal: AbortSignal | null | undefined
  stubFetch(t, async (init) => {
    signal = init?.signal
    return new Response('')
  })

  await fetchWithin(PLAYER)

  assert.equal(signal, undefined)
})
