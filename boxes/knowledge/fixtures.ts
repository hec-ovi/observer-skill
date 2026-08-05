/**
 * Shared setup for this box's tests. It sits outside `test/` on purpose: the node test
 * runner treats every file under a `test/` directory as a test file.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { createStore } from '#session'
import type { Session, SessionStore } from '#session'
import { createKnowledge } from './src/index.ts'
import type { Knowledge } from './src/index.ts'

export const DURATION = 1800

const SOURCE = {
  provider: 'youtube',
  videoId: 'dQw4w9WgXcQ',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'How a Fourier transform works',
  duration: DURATION,
  hasAds: false,
}

export interface Fixture {
  store: SessionStore
  knowledge: Knowledge
  session: Session
}

/** A store with one session in it, closed and removed when the test ends. */
export async function openKnowledge(t: TestContext): Promise<Fixture> {
  const home = await mkdtemp(join(tmpdir(), 'observer-knowledge-'))
  const store = createStore({ home })
  const session = await store.create({ source: SOURCE, settings: {} })
  t.after(async () => {
    await store.close()
    await rm(home, { recursive: true, force: true })
  })
  return { store, knowledge: createKnowledge({ store }), session }
}

/** A built visual on the record, as `artifact` leaves it before anything links to it. */
export async function buildArtifact(fixture: Fixture, id: string): Promise<void> {
  await fixture.store.putArtifact(fixture.session.id, {
    id,
    title: `Visual ${id}`,
    kind: 'chart',
    status: 'built',
    bundlePath: `sessions/${fixture.session.id}/artifacts/${id}.js`,
  })
}
