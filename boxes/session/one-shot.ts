/**
 * A one-shot caller: it creates a session and returns, with nothing else holding the event
 * loop open. The write `create` owes must land before the process exits. Spawned by
 * `test/store.test.ts` with the store home as its only argument.
 */

import { createStore } from '#session'
import { SOURCE } from './fixtures.ts'

const home = process.argv[2]
if (home === undefined) throw new Error('usage: one-shot.ts <home>')

const store = createStore({ home })
await store.create({ source: SOURCE, settings: {} })
