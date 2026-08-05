/**
 * A one-shot caller: it creates a session and returns, with nothing else holding the event
 * loop open. The write `create` owes must land before the process exits. Spawned by
 * `test/store.test.ts` with the store home as its only argument.
 */

import { createStore } from '#session'

const home = process.argv[2]
if (home === undefined) throw new Error('usage: one-shot.ts <home>')

const store = createStore({ home })
await store.create({
  source: {
    provider: 'youtube',
    videoId: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'How a Fourier transform works',
    duration: 1800,
    hasAds: false,
  },
  settings: {},
})
