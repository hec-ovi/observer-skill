/**
 * The closed error set. Each one has to tell the caller something it can act on: what to
 * install, what the provider said, or what to configure.
 */

import assert from 'node:assert/strict'
import { chmod, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { fetch as fetchTranscript } from '#transcript'

import { FAKE_YTDLP, caught, fixture, pool, source, stubFetch } from '../fixtures.ts'

describe('errors', () => {
  const boxes = pool()
  let previousBin: string | undefined

  before(() => {
    previousBin = process.env['YTDLP_BIN']
    delete process.env['FAKE_YTDLP_MANUAL']
    delete process.env['FAKE_YTDLP_AUTO']
    delete process.env['FAKE_YTDLP_FAIL']
    delete process.env['OBSERVER_ASR_URL']
  })

  after(async () => {
    if (previousBin === undefined) delete process.env['YTDLP_BIN']
    else process.env['YTDLP_BIN'] = previousBin
    await boxes.done()
  })

  test('a missing binary names what to install', async () => {
    const box = await boxes.open('missing-bin')
    process.env['YTDLP_BIN'] = join(box.home, 'nothing-here')

    const error = await caught(() =>
      fetchTranscript(source(), { home: box.home, sessionId: box.sessionId, provider: 'captions' }),
    )
    assert.equal(error.code, 'PROVIDER_UNAVAILABLE')
    assert.match(error.message, /captions/)
    assert.match(error.hint, /yt-dlp/)
  })

  test('a provider that ran and refused carries what it said', async () => {
    const box = await boxes.open('refused')
    process.env['YTDLP_BIN'] = FAKE_YTDLP
    process.env['FAKE_YTDLP_FAIL'] = "Sign in to confirm you're not a bot"

    let error
    try {
      error = await caught(() =>
        fetchTranscript(source(), { home: box.home, sessionId: box.sessionId, provider: 'captions' }),
      )
    } finally {
      delete process.env['FAKE_YTDLP_FAIL']
    }
    assert.equal(error.code, 'TRANSCRIPT_FAILED')
    assert.match(error.hint, /captions: YouTube asked for a bot check/)
  })

  test('nothing published anywhere is no transcript, and says how to get one', async () => {
    const box = await boxes.open('nothing')
    process.env['YTDLP_BIN'] = FAKE_YTDLP
    const restore = stubFetch(() => Promise.resolve(new Response('{}', { status: 200 })))

    let error
    try {
      error = await caught(() =>
        fetchTranscript(source(), { home: box.home, sessionId: box.sessionId }),
      )
    } finally {
      restore()
    }

    assert.equal(error.code, 'NO_TRANSCRIPT')
    assert.match(error.hint, /OBSERVER_ASR_URL/)
    assert.match(error.hint, /captions: this video publishes no caption track we can read/)
  })

  test('a home that will not take the words says which setting to check', async () => {
    const box = await boxes.open('unwritable')
    const locked = join(box.home, 'locked')
    await mkdir(locked)
    await chmod(locked, 0o500)

    let error
    try {
      error = await caught(() =>
        fetchTranscript(source(), {
          home: locked,
          sessionId: box.sessionId,
          provider: 'file',
          file: fixture('talk.srt'),
        }),
      )
    } finally {
      await chmod(locked, 0o700)
    }

    assert.equal(error.code, 'STORE_UNWRITABLE')
    assert.match(error.hint, /OBSERVER_HOME/)
  })
})
