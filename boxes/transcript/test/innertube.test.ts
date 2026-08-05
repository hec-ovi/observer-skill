/**
 * The transcript panel route, with the platform's own JSON recorded and served from disk.
 * Panel windows are caption sized, so the proof here is that they come out as sentences.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { fetch as fetchTranscript, read } from '#transcript'

import { FAKE_YTDLP, FIXTURES, pool, source, stubFetch } from '../fixtures.ts'

const panel = (name: string): string => readFileSync(join(FIXTURES, 'innertube', name), 'utf8')

/** The three calls the panel route makes, answered from the recording unless overridden. */
function serve(over: { player?: string; next?: string; transcript?: string } = {}): () => void {
  return stubFetch((url) => {
    const body = url.includes('/player')
      ? (over.player ?? panel('player.json'))
      : url.includes('/next')
        ? (over.next ?? panel('next.json'))
        : url.includes('/get_transcript')
          ? (over.transcript ?? panel('get_transcript.json'))
          : '{}'
    return Promise.resolve(
      new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
    )
  })
}

describe('innertube', () => {
  const boxes = pool()
  let previousBin: string | undefined

  before(() => {
    previousBin = process.env['YTDLP_BIN']
    process.env['YTDLP_BIN'] = FAKE_YTDLP
    delete process.env['FAKE_YTDLP_MANUAL']
    delete process.env['FAKE_YTDLP_AUTO']
    delete process.env['OBSERVER_ASR_URL']
  })

  after(async () => {
    if (previousBin === undefined) delete process.env['YTDLP_BIN']
    else process.env['YTDLP_BIN'] = previousBin
    await boxes.done()
  })

  test('the panel becomes sentences, not the windows it was written in', async () => {
    const box = await boxes.open('panel')
    const restore = serve()
    try {
      const ref = await fetchTranscript(source(), {
        home: box.home,
        sessionId: box.sessionId,
        provider: 'innertube',
        onProgress: box.onProgress,
      })
      assert.equal(ref.provider, 'innertube')
      assert.equal(ref.generated, true)
      assert.equal(ref.language, 'en')
    } finally {
      restore()
    }

    const page = read(box.sessionId)
    assert.deepEqual(
      page.segments.map((segment) => segment.text),
      [
        'In a single minute your body produces 120 million red blood cells.',
        'Each one carries oxygen from the lungs to every tissue that needs it.',
        '[Music]',
        'The whole trip takes about twenty seconds.',
      ],
    )
    assert.equal(page.segments[0]?.start, 0)
    assert.equal(page.segments[0]?.end, 6.4)
  })

  test('auto walks past the caption binary when it finds nothing published', async () => {
    const box = await boxes.open('auto-panel')
    const restore = serve()
    try {
      const ref = await fetchTranscript(source(), {
        home: box.home,
        sessionId: box.sessionId,
        onProgress: box.onProgress,
      })
      assert.equal(ref.provider, 'innertube')
    } finally {
      restore()
    }
  })

  test('a video with no panel is not a failure, it is nothing to read', async () => {
    const box = await boxes.open('no-panel')
    const restore = serve({ next: '{}' })
    try {
      await assert.rejects(
        fetchTranscript(source(), {
          home: box.home,
          sessionId: box.sessionId,
          provider: 'innertube',
          onProgress: box.onProgress,
        }),
        { code: 'NO_TRANSCRIPT' },
      )
    } finally {
      restore()
    }
  })
})
