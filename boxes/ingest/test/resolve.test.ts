import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolve } from '#ingest'
import { ObserverError } from '#errors'
import { replay } from './replay.ts'

const NORMAL = 'https://www.youtube.com/watch?v=aircAruvnKk'

async function failure(url: string, plan: Parameters<typeof replay>[0] | null) {
  const restore = plan === null ? () => {} : replay(plan)
  try {
    await resolve({ url })
    assert.fail('resolve should have thrown')
  } catch (error) {
    assert.ok(error instanceof ObserverError, `expected an ObserverError, got ${String(error)}`)
    return error
  } finally {
    restore()
  }
}

test('a normal video resolves with everything the caller needs', async (t) => {
  t.after(replay({ oembed: 'oembed-normal.json', innertube: 'innertube-normal.json' }))

  const source = await resolve({ url: NORMAL, hasAds: true })

  assert.equal(source.provider, 'youtube')
  assert.equal(source.videoId, 'aircAruvnKk')
  assert.equal(source.url, 'https://www.youtube.com/watch?v=aircAruvnKk')
  assert.equal(source.title, 'But what is a neural network? | Deep learning chapter 1')
  assert.equal(source.channel, '3Blue1Brown')
  assert.equal(source.duration, 1120)
  assert.equal(source.publishedAt, '2017-10-05')
  assert.equal(source.hasCaptions, true)
  assert.ok(source.captionLanguages.includes('en'))
  assert.equal(source.hasAds, true)
  assert.equal(source.embeddable, true)
  assert.equal(source.degraded, false)
})

test('hasAds is carried through untouched and defaults to false', async (t) => {
  t.after(replay({ oembed: 'oembed-normal.json', innertube: 'innertube-normal.json' }))

  const source = await resolve({ url: NORMAL })
  assert.equal(source.hasAds, false)
})

test('a video with no captions says so instead of leaving it unknown', async (t) => {
  t.after(replay({ oembed: 'oembed-no-captions.json', innertube: 'innertube-no-captions.json' }))

  const source = await resolve({ url: 'https://youtu.be/HZW4cEBWl58' })

  assert.equal(source.videoId, 'HZW4cEBWl58')
  assert.equal(source.hasCaptions, false)
  assert.deepEqual(source.captionLanguages, [])
  assert.equal(source.duration, 44)
  assert.equal(source.publishedAt, '2012-03-06')
  assert.equal(source.degraded, false)
})

test('a video the owner blocked from embedding is refused by the embed check', async () => {
  const error = await failure('https://www.youtube.com/watch?v=bquQVe4zLhQ', {
    oembed: 'oembed-not-embeddable.json',
  })

  assert.equal(error.code, 'SOURCE_NOT_EMBEDDABLE')
  assert.match(error.hint, /Pick another video/)
})

test('the player alone can still catch a video that refuses to embed', async () => {
  const error = await failure('https://www.youtube.com/watch?v=bquQVe4zLhQ', {
    oembed: 'oembed-normal.json',
    innertube: 'innertube-not-embeddable.json',
  })

  assert.equal(error.code, 'SOURCE_NOT_EMBEDDABLE')
})

test('a video that does not exist is unavailable', async () => {
  const error = await failure('https://www.youtube.com/watch?v=AAAAAAAAAAA', {
    oembed: 'oembed-missing.json',
  })

  assert.equal(error.code, 'SOURCE_UNAVAILABLE')
  assert.match(error.message, /private, deleted, or does not exist/)
})

test('an id YouTube itself rejects is a bad source', async () => {
  const error = await failure('https://www.youtube.com/watch?v=11111111111', {
    oembed: 'oembed-bad-id.json',
  })

  assert.equal(error.code, 'BAD_SOURCE')
  assert.match(error.hint, /youtu\.be/)
})

test('an embed check that never answers is a provider failure, not a bad link', async () => {
  const error = await failure(NORMAL, { oembed: 503 })

  assert.equal(error.code, 'PROVIDER_UNAVAILABLE')
})

test('the richer lookup being unreachable degrades the extra fields', async (t) => {
  t.after(replay({ oembed: 'oembed-normal.json' }))

  const source = await resolve({ url: NORMAL })

  assert.equal(source.title, 'But what is a neural network? | Deep learning chapter 1')
  assert.equal(source.embeddable, true)
  assert.equal(source.degraded, true)
  assert.equal(source.duration, null)
  assert.equal(source.publishedAt, null)
  assert.equal(source.hasCaptions, null)
  assert.deepEqual(source.captionLanguages, [])
})

test('the richer lookup refusing us degrades rather than condemning the video', async (t) => {
  t.after(replay({ oembed: 'oembed-normal.json', innertube: 'innertube-refused.json' }))

  const source = await resolve({ url: NORMAL })

  assert.equal(source.embeddable, true)
  assert.equal(source.degraded, true)
  assert.equal(source.duration, null)
  assert.equal(source.hasCaptions, null)
})

test('the player request carries the deadline, so a stalled lookup is torn down', async (t) => {
  const signals = new Map<string, AbortSignal | null | undefined>()
  t.after(
    replay({
      oembed: 'oembed-normal.json',
      innertube: 'innertube-normal.json',
      watch: (url, init) => signals.set(new URL(url).pathname, init?.signal),
    }),
  )

  await resolve({ url: NORMAL })

  const player = signals.get('/youtubei/v1/player')
  assert.ok(player instanceof AbortSignal, 'the player request should carry an abort signal')
  assert.equal(player.aborted, false)
})
