import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { makeSession, postJson, startHost } from '../fixtures.ts'

const asked: unknown[] = []
const ranges: unknown[] = []

const running = await startHost({
  createSession: async (input) => {
    asked.push(input)
    return makeSession({ id: 's2' })
  },
  readTranscript: async (sessionId, range) => {
    ranges.push({ sessionId, range })
    return { segments: [{ at: 0, text: 'hello' }], total: 1 }
  },
})
after(() => running.stop())

test('a URL posted by the page becomes a session', async () => {
  const answer = await postJson(`${running.base}/api/session`, {
    url: 'https://www.youtube.com/watch?v=abc123',
    settings: { theme: 'dark' },
  })

  assert.equal(answer.status, 201)
  assert.equal((answer.body as { id: string }).id, 's2')
  assert.deepEqual(asked, [
    {
      url: 'https://www.youtube.com/watch?v=abc123',
      settings: { theme: 'dark' },
      userPrompt: null,
    },
  ])
})

test('the transcript is served by the range the page asked for', async () => {
  const answer = await fetch(`${running.base}/api/session/s1/transcript?from=30&to=90&limit=50`)

  assert.equal(answer.status, 200)
  assert.deepEqual(await answer.json(), { segments: [{ at: 0, text: 'hello' }], total: 1 })
  assert.deepEqual(ranges, [
    { sessionId: 's1', range: { from: 30, to: 90, offset: 0, limit: 50 } },
  ])
})

test('a host with no session opener says so instead of guessing', async () => {
  const bare = await startHost()
  try {
    const answer = await postJson(`${bare.base}/api/session`, { url: 'https://example.com/v' })
    assert.equal(answer.status, 503)
    assert.equal((answer.body as { code: string }).code, 'PROVIDER_UNAVAILABLE')
  } finally {
    await bare.stop()
  }
})
