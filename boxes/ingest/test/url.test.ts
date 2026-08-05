import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolve } from '#ingest'
import { ObserverError } from '#errors'
import { replay } from './replay.ts'

const ID = 'aircAruvnKk'

const ACCEPTED = [
  `https://www.youtube.com/watch?v=${ID}`,
  `http://youtube.com/watch?v=${ID}`,
  `https://m.youtube.com/watch?v=${ID}`,
  `https://music.youtube.com/watch?v=${ID}`,
  `https://www.youtube.com/watch?v=${ID}&list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi&index=1`,
  `https://youtu.be/${ID}`,
  `https://youtu.be/${ID}?t=42`,
  `https://www.youtube.com/embed/${ID}`,
  `https://www.youtube.com/shorts/${ID}`,
  `https://www.youtube.com/live/${ID}`,
  `www.youtube.com/watch?v=${ID}`,
  `youtu.be/${ID}`,
  ID,
  `  ${ID}  `,
]

const REJECTED = [
  '',
  'not a url at all',
  'https://vimeo.com/76979871',
  'https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi',
  'https://www.youtube.com/@3blue1brown',
  'https://www.youtube.com/watch',
  'https://www.youtube.com/watch?v=short',
  'https://www.youtube.com/embed/',
  'aircAruvnK',
  'aircAruvnKkX',
]

for (const url of ACCEPTED) {
  test(`accepts ${url.trim()}`, async (t) => {
    t.after(replay({ oembed: 'oembed-normal.json', innertube: 'innertube-normal.json' }))

    const source = await resolve({ url })
    assert.equal(source.videoId, ID)
    assert.equal(source.url, `https://www.youtube.com/watch?v=${ID}`)
  })
}

for (const url of REJECTED) {
  test(`rejects ${url === '' ? '(empty)' : url}`, async (t) => {
    // Any lookup this stub answers would surface as PROVIDER_UNAVAILABLE, so a rejected
    // link that reached the network would not pass as a bad source.
    t.after(replay({ oembed: 503 }))

    await assert.rejects(resolve({ url }), (error: unknown) => {
      assert.ok(error instanceof ObserverError)
      assert.equal(error.code, 'BAD_SOURCE')
      return true
    })
  })
}
