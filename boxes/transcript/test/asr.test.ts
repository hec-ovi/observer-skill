/**
 * Speech recognition, with the downloader, ffmpeg, and the transcription route all faked at
 * their own boundary. The point of the test is the seam: chunk two's times must land on the
 * video's timeline, at the offset ffmpeg actually cut, not the one that was asked for.
 *
 * The other point is what a server sends back. Word lists differ per server, and only a list
 * that spells out the segment's own text may be trusted with the times.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, describe, test } from 'node:test'

import { fetch as fetchTranscript, read } from '#transcript'

import { FAKE_FFMPEG, FAKE_YTDLP, fixture, pool, source, stubFetch } from '../fixtures.ts'

const BASE = 'http://127.0.0.1:9999'
/** The second chunk the fake ffmpeg always cuts, when only the first one carries speech. */
const SILENT = '{"task":"transcribe","language":"english","duration":0,"text":"","segments":[]}'

/** Answers the first chunk from a fixture and the second with silence. */
function serve(name: string): () => void {
  let call = 0
  return stubFetch(() => {
    const body = call === 0 ? readFileSync(fixture(name), 'utf8') : SILENT
    call += 1
    return Promise.resolve(
      new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
    )
  })
}

describe('endpoint-asr', () => {
  const boxes = pool()
  const kept: Record<string, string | undefined> = {}

  before(() => {
    for (const name of ['YTDLP_BIN', 'FFMPEG_BIN', 'OBSERVER_ASR_URL', 'OBSERVER_ASR_KEY']) {
      kept[name] = process.env[name]
    }
    process.env['YTDLP_BIN'] = FAKE_YTDLP
    process.env['FFMPEG_BIN'] = FAKE_FFMPEG
    process.env['OBSERVER_ASR_URL'] = BASE
    process.env['OBSERVER_ASR_KEY'] = 'test-key'
  })

  after(async () => {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    await boxes.done()
  })

  test('two audio chunks come back as one timeline', async () => {
    const box = await boxes.open('asr')
    const calls: string[] = []
    const restore = stubFetch((url) => {
      const body = readFileSync(fixture(`asr-chunk-${calls.length}.json`), 'utf8')
      calls.push(url)
      return Promise.resolve(
        new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
      )
    })

    let ref
    try {
      ref = await fetchTranscript(source({ duration: 905 }), {
        home: box.home,
        sessionId: box.sessionId,
        provider: 'endpoint-asr',
        onProgress: box.onProgress,
      })
    } finally {
      restore()
    }

    assert.equal(ref.provider, 'endpoint-asr')
    assert.equal(ref.generated, true)
    assert.equal(ref.language, 'english')
    assert.deepEqual(calls, [`${BASE}/v1/audio/transcriptions`, `${BASE}/v1/audio/transcriptions`])

    const page = read(box.sessionId)
    assert.deepEqual(
      page.segments.map((segment) => segment.text),
      [
        'Welcome to the show.',
        'Today we are talking about heat engines and why they waste so much.',
        'So the second half is about entropy.',
        'It is the reason no engine reaches a hundred percent.',
      ],
    )
    assert.equal(page.segments[0]?.start, 0)
    assert.equal(page.segments[2]?.start, 601.216)
    assert.equal(page.segments[3]?.end, 610.616)
  })

  test('progress counts the chunks, which is what takes the time', async () => {
    const box = await boxes.open('asr-progress')
    const restore = stubFetch(() =>
      Promise.resolve(
        new Response(readFileSync(fixture('asr-chunk-0.json'), 'utf8'), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    try {
      await fetchTranscript(source({ duration: 905 }), {
        home: box.home,
        sessionId: box.sessionId,
        provider: 'endpoint-asr',
        onProgress: box.onProgress,
      })
    } finally {
      restore()
    }

    const steps = box.progress.filter((entry) => entry.step === 'transcribe')
    assert.deepEqual(
      steps.map((entry) => `${entry.done}/${entry.total}`),
      ['0/2', '1/2', '2/2'],
    )
    assert.ok(box.progress.some((entry) => entry.step === 'audio' && entry.total > 0))
  })

  test('a server that times token pieces still stores whole words', async () => {
    const box = await boxes.open('asr-tokens')
    const restore = serve('asr-tokens.json')
    try {
      await fetchTranscript(source({ duration: 905 }), {
        home: box.home,
        sessionId: box.sessionId,
        provider: 'endpoint-asr',
        onProgress: box.onProgress,
      })
    } finally {
      restore()
    }

    const page = read(box.sessionId)
    assert.deepEqual(
      page.segments.map((segment) => segment.text),
      ['So the second half is about entropy.'],
    )
    assert.equal(page.segments[0]?.start, 1.2)
  })

  test('a word timed outside its own segment is not dropped', async () => {
    const box = await boxes.open('asr-gap-word')
    const restore = serve('asr-gap-word.json')
    try {
      await fetchTranscript(source({ duration: 905 }), {
        home: box.home,
        sessionId: box.sessionId,
        provider: 'endpoint-asr',
        onProgress: box.onProgress,
      })
    } finally {
      restore()
    }

    const page = read(box.sessionId)
    assert.deepEqual(
      page.segments.map((segment) => segment.text),
      ['Ready to begin now', 'the second part.'],
    )
  })

  test('an endpoint that refuses says what it answered', async () => {
    const box = await boxes.open('asr-refused')
    const restore = stubFetch(() =>
      Promise.resolve(new Response('model not loaded', { status: 503 })),
    )
    try {
      await assert.rejects(
        fetchTranscript(source(), {
          home: box.home,
          sessionId: box.sessionId,
          provider: 'endpoint-asr',
          onProgress: box.onProgress,
        }),
        (error: { code: string; hint: string }) =>
          error.code === 'TRANSCRIPT_FAILED' && /503 model not loaded/.test(error.hint),
      )
    } finally {
      restore()
    }
  })

  test('no endpoint configured names the setting that turns it on', async () => {
    const box = await boxes.open('asr-unset')
    delete process.env['OBSERVER_ASR_URL']
    try {
      await assert.rejects(
        fetchTranscript(source(), {
          home: box.home,
          sessionId: box.sessionId,
          provider: 'endpoint-asr',
          onProgress: box.onProgress,
        }),
        (error: { code: string; hint: string }) =>
          error.code === 'PROVIDER_UNAVAILABLE' && /OBSERVER_ASR_URL/.test(error.hint),
      )
    } finally {
      process.env['OBSERVER_ASR_URL'] = BASE
    }
  })
})
