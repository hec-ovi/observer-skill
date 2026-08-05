/**
 * The closed error set. Each one has to tell the caller something it can act on: what to
 * install, what the provider said, or what to configure.
 */

import assert from 'node:assert/strict'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'

import { fetch as fetchTranscript } from '#transcript'

import type { Harness } from '../fixtures.ts'
import { FAKE_YTDLP, caught, harness, source, stubFetch } from '../fixtures.ts'

describe('errors', () => {
  const boxes: Harness[] = []
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
    delete process.env['FAKE_YTDLP_FAIL']
    for (const box of boxes) await box.done()
  })

  async function open(id: string): Promise<Harness> {
    const box = await harness(id)
    boxes.push(box)
    return box
  }

  test('a missing binary names what to install', async () => {
    const box = await open('missing-bin')
    process.env['YTDLP_BIN'] = join(box.home, 'nothing-here')

    const error = await caught(() =>
      fetchTranscript(source(), { home: box.home, sessionId: box.sessionId, provider: 'captions' }),
    )
    assert.equal(error.code, 'PROVIDER_UNAVAILABLE')
    assert.match(error.message, /captions/)
    assert.match(error.hint, /yt-dlp/)
  })

  test('a provider that ran and refused carries what it said', async () => {
    const box = await open('refused')
    process.env['YTDLP_BIN'] = FAKE_YTDLP
    process.env['FAKE_YTDLP_FAIL'] = "Sign in to confirm you're not a bot"

    const error = await caught(() =>
      fetchTranscript(source(), { home: box.home, sessionId: box.sessionId, provider: 'captions' }),
    )
    assert.equal(error.code, 'TRANSCRIPT_FAILED')
    assert.match(error.hint, /captions: YouTube asked for a bot check/)
    delete process.env['FAKE_YTDLP_FAIL']
  })

  test('nothing published anywhere is no transcript, and says how to get one', async () => {
    const box = await open('nothing')
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
})
