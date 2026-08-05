/**
 * The caption route, with the fetcher binary faked at the subprocess boundary so the provider
 * runs its real code path against recorded caption files.
 *
 * The duplication check is the one this box exists for: a rolling machine track restates the
 * previous line in every window, and the words that come out must be the words that went in,
 * once each, in order.
 */

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, describe, test } from 'node:test'

import type { TranscriptRef } from '#transcript'
import { fetch as fetchTranscript, read } from '#transcript'

import type { Harness } from '../fixtures.ts'
import { FAKE_YTDLP, fixture, harness, source, words } from '../fixtures.ts'

/** Every word the caption file carries, ignoring the rolling-window continuations. */
async function json3Words(name: string): Promise<string[]> {
  const doc = JSON.parse(await readFile(fixture(name), 'utf8')) as {
    events: { aAppend?: number; segs?: { utf8?: string }[] }[]
  }
  const spoken = doc.events
    .filter((event) => Array.isArray(event.segs) && !event.aAppend)
    .map((event) => (event.segs ?? []).map((seg) => seg.utf8 ?? '').join(''))
  return words(spoken)
}

function transcribe(box: Harness, track: { manual?: string; auto?: string }): Promise<TranscriptRef> {
  process.env['FAKE_YTDLP_MANUAL'] = track.manual ? fixture(track.manual) : ''
  process.env['FAKE_YTDLP_AUTO'] = track.auto ? fixture(track.auto) : ''
  return fetchTranscript(source(), {
    home: box.home,
    sessionId: box.sessionId,
    provider: 'captions',
    onProgress: box.onProgress,
  })
}

describe('captions', () => {
  const boxes: Harness[] = []
  let previousBin: string | undefined

  before(() => {
    previousBin = process.env['YTDLP_BIN']
    process.env['YTDLP_BIN'] = FAKE_YTDLP
  })

  after(async () => {
    if (previousBin === undefined) delete process.env['YTDLP_BIN']
    else process.env['YTDLP_BIN'] = previousBin
    delete process.env['FAKE_YTDLP_MANUAL']
    delete process.env['FAKE_YTDLP_AUTO']
    for (const box of boxes) await box.done()
  })

  async function open(id: string): Promise<Harness> {
    const box = await harness(id)
    boxes.push(box)
    return box
  }

  test('a track a human wrote becomes one segment per sentence, and is not marked generated', async () => {
    const box = await open('human')
    const ref = await transcribe(box, { manual: 'human.json3' })

    assert.equal(ref.provider, 'captions')
    assert.equal(ref.generated, false)
    assert.equal(ref.language, 'en')
    assert.equal(ref.segmentCount, 4)

    const page = read(box.sessionId)
    assert.deepEqual(
      page.segments.map((segment) => segment.text),
      [
        'In a single minute your body produces 120 million red blood cells.',
        'Each one carries oxygen from your lungs to every tissue that needs it.',
        'The whole round trip takes about twenty seconds.',
        'That is why a shortage of iron & a shortage of oxygen feel like the same thing.',
      ],
    )
    assert.equal(page.segments[0]?.start, 0)
    assert.equal(page.segments[1]?.start, 3.94)
  })

  test('a rolling machine track keeps every word exactly once, in order', async () => {
    const box = await open('rolling')
    await transcribe(box, { auto: 'rolling.json3' })

    const page = read(box.sessionId)
    const out = words(page.segments.map((segment) => segment.text))
    assert.deepEqual(out, await json3Words('rolling.json3'))
    assert.equal(out.filter((word) => word === 'entropy').length, 2)
  })

  test('a rolling machine track is marked generated and never overlaps itself', async () => {
    const box = await open('rolling-times')
    const ref = await transcribe(box, { auto: 'rolling.json3' })
    assert.equal(ref.generated, true)

    const page = read(box.sessionId)
    for (const [i, segment] of page.segments.entries()) {
      assert.equal(segment.i, i)
      assert.ok(segment.end >= segment.start)
      const next = page.segments[i + 1]
      if (next) assert.ok(next.start >= segment.end)
    }
  })

  test('a rolling vtt drops the lines each window restates', async () => {
    const box = await open('rolling-vtt')
    await transcribe(box, { auto: 'rolling-auto.vtt' })

    const page = read(box.sessionId)
    assert.deepEqual(words(page.segments.map((segment) => segment.text)), [
      'so', 'the', 'first', 'thing', 'we', 'need',
      'to', 'talk', 'about', 'is', 'entropy',
      'and', 'entropy', 'is', 'a', 'measure',
      'of', 'disorder', 'in', 'a', 'system',
    ])
  })

  test('music and applause stay as their own segments and out of the speech', async () => {
    const box = await open('markers')
    await transcribe(box, { auto: 'markers.json3' })

    const page = read(box.sessionId)
    const texts = page.segments.map((segment) => segment.text)
    assert.deepEqual(texts, [
      '[Music]',
      'welcome back to the show.',
      '[Applause]',
      'tonight we are talking about heat.',
      '[Laughter]',
    ])
    const music = page.segments[0]
    assert.equal(music?.start, 0.5)
    assert.equal(music?.end, 5.2)
  })

  test('a fifteen-minute gap ends a segment instead of stretching one across it', async () => {
    const box = await open('gap')
    await transcribe(box, { auto: 'gap.json3' })

    const page = read(box.sessionId)
    assert.equal(page.total, 2)
    assert.deepEqual(
      page.segments.map((segment) => segment.text),
      ['the lecture starts here and then nobody speaks', 'fifteen minutes later we resume with the second half'],
    )
    assert.equal(page.segments[0]?.end, 6.6)
    assert.equal(page.segments[1]?.start, 906.6)
  })

  test('captions a human wrote win over the machine ones', async () => {
    const box = await open('both')
    await transcribe(box, { manual: 'human.json3', auto: 'rolling.json3' })

    const page = read(box.sessionId)
    assert.match(page.segments[0]?.text ?? '', /^In a single minute/)
  })

  test('progress reports the step it is on with a real total', async () => {
    const box = await open('progress')
    await transcribe(box, { manual: 'human.json3' })

    assert.ok(box.progress.some((entry) => entry.step === 'captions' && entry.total === 2))
    const last = box.progress[box.progress.length - 1]
    assert.equal(last?.step, 'transcript')
    assert.equal(last?.done, 4)
    assert.equal(last?.total, 4)
  })
})
