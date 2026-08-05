/**
 * The page's own way in, through the wiring the CLI builds. `POST /api/session` runs the same
 * call the `open` tool runs, so a video pasted in the browser has to leave a real record with
 * everything the user chose on it, the ads answer included.
 *
 * Only the lookup `ingest` makes is answered from here. Every box below is the real one.
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { readConfig } from '#config'
import type { Session } from '#session'
import { wire } from '../wiring.ts'
import type { Wiring } from '../wiring.ts'

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

/** YouTube answers from here; anything else, our own server included, goes out as it did. */
function stubYouTube(): () => void {
  const original = globalThis.fetch
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.includes('youtube.com')) return original(input, init)
    if (url.startsWith('https://www.youtube.com/oembed')) {
      return Promise.resolve(
        Response.json({ title: 'How a Fourier transform works', author_name: 'Signals' }),
      )
    }
    // The richer lookup is optional by contract, so a refusal leaves the keyless source.
    return Promise.resolve(new Response('', { status: 403 }))
  }) as typeof globalThis.fetch
  return () => {
    globalThis.fetch = original
  }
}

describe('the page opens a session', () => {
  let home: string
  let wiring: Wiring
  let base: string
  let restore: () => void

  before(async () => {
    home = await mkdtemp(join(tmpdir(), 'observer-page-'))
    restore = stubYouTube()
    wiring = await wire({
      ...readConfig({}),
      home,
      port: 0,
      openBrowser: false,
      // The transcription run behind the session refuses at once with no file to read, so
      // nothing reaches for a binary or the network while this test is asserting.
      transcript: 'file',
    })
    base = (await wiring.host.start()).url
  })

  after(async () => {
    restore()
    await wiring.close()
    await rm(home, { recursive: true, force: true })
  })

  it('creates a real session, with the ads answer on the record', async () => {
    const response = await fetch(`${base}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: VIDEO,
        hasAds: true,
        settings: { toolkit: false },
        userPrompt: 'why does it work',
      }),
    })

    assert.equal(response.status, 201)
    const created = (await response.json()) as Session
    assert.equal(created.source.hasAds, true)

    // Read it back off the process the route created it in: this is a session, not a reply.
    const again = await fetch(`${base}/api/session/${created.id}`)
    assert.equal(again.status, 200)
    const record = (await again.json()) as Session

    assert.equal(record.source.hasAds, true)
    assert.equal(record.source.videoId, 'dQw4w9WgXcQ')
    assert.equal(record.source.title, 'How a Fourier transform works')
    assert.equal(record.userPrompt, 'why does it work')
    assert.equal(record.settings.toolkit, false)
  })
})
