/** The subtitle file a user supplies: SubRip and WebVTT, and what happens when it is not there. */

import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { fetch as fetchTranscript, read } from '#transcript'

import type { Harness } from '../fixtures.ts'
import { caught, fixture, harness, source } from '../fixtures.ts'

describe('file', () => {
  const boxes: Harness[] = []

  after(async () => {
    for (const box of boxes) await box.done()
  })

  async function open(id: string): Promise<Harness> {
    const box = await harness(id)
    boxes.push(box)
    return box
  }

  test('an srt becomes sentences with the cue times a player would report', async () => {
    const box = await open('srt')
    const ref = await fetchTranscript(source(), {
      home: box.home,
      sessionId: box.sessionId,
      provider: 'file',
      file: fixture('talk.srt'),
      onProgress: box.onProgress,
    })

    assert.equal(ref.provider, 'file')
    assert.equal(ref.generated, false)
    assert.equal(ref.segmentCount, 4)

    const page = read(box.sessionId)
    assert.deepEqual(
      page.segments.map((segment) => segment.text),
      [
        'The first law says energy is never lost.',
        'It only moves, and every move leaves a little less of it useful.',
        'That leftover is what we call entropy, and it is the reason engines have limits.',
        'Carnot worked this out before anyone knew what heat actually was.',
      ],
    )
    assert.equal(page.segments[0]?.start, 1)
    assert.equal(page.segments[3]?.end, 17)
  })

  test('a vtt the user supplies reads the same way the platform track does', async () => {
    const box = await open('vtt')
    const ref = await fetchTranscript(source(), {
      home: box.home,
      sessionId: box.sessionId,
      provider: 'file',
      file: fixture('rolling-auto.vtt'),
      onProgress: box.onProgress,
    })

    assert.equal(ref.provider, 'file')
    const page = read(box.sessionId)
    assert.equal(page.segments.length, ref.segmentCount)
    assert.match(page.segments.map((segment) => segment.text).join(' '), /^so the first thing we need/)
  })

  test('no file to read names what to pass', async () => {
    const box = await open('no-file')
    const error = await caught(() =>
      fetchTranscript(source(), { home: box.home, sessionId: box.sessionId, provider: 'file' }),
    )

    assert.equal(error.code, 'PROVIDER_UNAVAILABLE')
    assert.match(error.hint, /SRT or VTT/)
  })
})
