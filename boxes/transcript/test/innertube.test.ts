/**
 * The in-process caption route, replayed from the platform's own recorded responses.
 *
 * The route reads the caption track the player response points at, which serves the same
 * `json3` the fetcher binary asks for. What is proven here is the choosing: a video that
 * publishes thirty translations must come back in the language it is spoken in, not the one
 * that sorts first.
 *
 * Recordings come from `scripts/capture-fixtures.ts`, trimmed to the branches this box
 * reads. The player script is not among them: it is fetched for a signature timestamp a
 * replay never uses, so it is answered with a stub.
 */

import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import { fetch as fetchTranscript, read } from '#transcript'

import { caught, pool, replayInnertube as replay, source } from '../fixtures.ts'

describe('innertube', () => {
  const boxes = pool()
  after(() => boxes.done())
  let n = 0
  const SESSION = (): string => `s${(n += 1)}`

  before(() => {
    delete process.env['FAKE_YTDLP_MANUAL']
    delete process.env['FAKE_YTDLP_AUTO']
    delete process.env['OBSERVER_ASR_URL']
  })

  test('reads the track the video publishes, not the one that sorts first', async () => {
    // This video ships thirty-one tracks, alphabetical, so the first one is Arabic.
    after(replay('normal'))
    const box = await boxes.open(SESSION())

    const ref = await fetchTranscript(source({ videoId: 'aircAruvnKk' }), {
      home: box.home,
      sessionId: box.sessionId,
      provider: 'innertube',
      onProgress: () => {},
    })

    assert.equal(ref.provider, 'innertube')
    assert.equal(ref.language, 'en')
    assert.equal(ref.generated, false)
    assert.ok(ref.segmentCount > 100, `only ${ref.segmentCount} segments`)
    assert.match(read(box.sessionId, { limit: 1 }).segments[0]?.text ?? '', /^This is a 3/)
  })

  test('takes the language the caller asked for when the video has it', async () => {
    after(replay('normal'))
    const box = await boxes.open(SESSION())

    const ref = await fetchTranscript(source({ videoId: 'aircAruvnKk' }), {
      home: box.home,
      sessionId: box.sessionId,
      provider: 'innertube',
      language: 'de',
      onProgress: () => {},
    })

    assert.equal(ref.language, 'de')
  })

  test('a video that publishes no caption track is nothing to read, not a failure', async () => {
    after(replay('no-captions'))
    const box = await boxes.open(SESSION())

    const error = await caught(() =>
      fetchTranscript(source({ videoId: 'HZW4cEBWl58' }), {
        home: box.home,
        sessionId: box.sessionId,
        provider: 'innertube',
        onProgress: () => {},
      }),
    )

    assert.equal(error.code, 'NO_TRANSCRIPT')
    assert.match(error.hint, /caption track/)
  })

  test('says so when the caption endpoint is rate limiting this machine', async () => {
    // A 429 is the address being throttled, not anything wrong with the video, and it clears
    // on its own. "Could not produce text" would send someone hunting for a bug.
    after(replay('normal', (url) => (url.includes('/api/timedtext') ? new Response('', { status: 429 }) : null)))
    const box = await boxes.open(SESSION())

    const error = await caught(() =>
      fetchTranscript(source({ videoId: 'aircAruvnKk' }), {
        home: box.home,
        sessionId: box.sessionId,
        provider: 'innertube',
        onProgress: () => {},
      }),
    )

    assert.match(error.hint, /rate limiting/)
  })
})
