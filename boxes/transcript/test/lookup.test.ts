/**
 * Reading the transcript back: a page of it, and the window around a second of video.
 * The lookup has to answer inside a pause, so it is proven to work with the file deleted.
 */

import assert from 'node:assert/strict'
import { rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { at, fetch as fetchTranscript, read } from '#transcript'

import type { Harness } from '../fixtures.ts'
import { FAKE_YTDLP, caught, fixture, harness, source } from '../fixtures.ts'

describe('read and at', () => {
  let box: Harness
  let previousBin: string | undefined

  before(async () => {
    previousBin = process.env['YTDLP_BIN']
    process.env['YTDLP_BIN'] = FAKE_YTDLP
    process.env['FAKE_YTDLP_MANUAL'] = fixture('human.json3')
    delete process.env['FAKE_YTDLP_AUTO']

    box = await harness('lookup')
    await fetchTranscript(source(), {
      home: box.home,
      sessionId: box.sessionId,
      provider: 'captions',
      onProgress: box.onProgress,
    })
  })

  after(async () => {
    if (previousBin === undefined) delete process.env['YTDLP_BIN']
    else process.env['YTDLP_BIN'] = previousBin
    delete process.env['FAKE_YTDLP_MANUAL']
    await box.done()
  })

  test('a page carries the whole transcript when nothing bounds it', () => {
    const page = read(box.sessionId)
    assert.equal(page.offset, 0)
    assert.equal(page.total, 4)
    assert.equal(page.segments.length, 4)
    assert.equal(page.nextOffset, undefined)
  })

  test('offset and limit page through it and say where to resume', () => {
    const page = read(box.sessionId, { offset: 1, limit: 2 })
    assert.deepEqual(
      page.segments.map((segment) => segment.i),
      [1, 2],
    )
    assert.equal(page.offset, 1)
    assert.equal(page.total, 4)
    assert.equal(page.nextOffset, 3)

    const rest = read(box.sessionId, { offset: page.nextOffset, limit: 2 })
    assert.deepEqual(
      rest.segments.map((segment) => segment.i),
      [3],
    )
    assert.equal(rest.nextOffset, undefined)
  })

  test('a time range keeps every segment that overlaps it and no other', () => {
    const page = read(box.sessionId, { from: 10, to: 15 })
    assert.deepEqual(
      page.segments.map((segment) => segment.i),
      [2, 3],
    )
    assert.equal(page.total, 2)
  })

  test('a lookup at an arbitrary second returns the words either side of it', () => {
    const window = at(box.sessionId, 10, { back: 6, forward: 4 })

    assert.equal(window.at, 10)
    assert.equal(window.segment.i, 2)
    assert.deepEqual(
      window.before.map((segment) => segment.i),
      [1],
    )
    assert.deepEqual(window.after, [])
    assert.equal(
      window.text,
      'Each one carries oxygen from your lungs to every tissue that needs it. ' +
        '[paused at 0:10] The whole round trip takes about twenty seconds.',
    )
  })

  test('a lookup on a segment boundary belongs to the segment that starts there', () => {
    assert.equal(at(box.sessionId, 3.94).segment.i, 1)
    assert.equal(at(box.sessionId, 3.939).segment.i, 0)
  })

  test('a lookup past the end holds on the last segment', () => {
    const window = at(box.sessionId, 999)
    assert.equal(window.at, 999)
    assert.equal(window.segment.i, 3)
    assert.deepEqual(window.after, [])
    assert.match(window.text, /\[paused at 16:39]/)
  })

  test('a lookup reads no disk once the transcript is loaded', async () => {
    const path = join(box.home, 'sessions', box.sessionId, 'transcript.json')
    assert.ok((await stat(path)).isFile())

    const before = at(box.sessionId, 10)
    await rm(path)
    assert.deepEqual(at(box.sessionId, 10), before)
  })

  test('a session that never transcribed says so', async () => {
    const error = await caught(() => read('sess-nothing'))
    assert.equal(error.code, 'UNKNOWN_SESSION')

    const other = await caught(() => at('sess-nothing', 5))
    assert.equal(other.code, 'UNKNOWN_SESSION')
  })
})
