/**
 * Shared setup for this box's tests. It sits outside `test/` on purpose: the node test
 * runner treats every file under a `test/` directory as a test file, and a helper counted
 * as a passing test is a lie in the suite output.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { createStore } from '#session'
import type { NewSessionInput, Session, SessionStore } from '#session'

export const SOURCE = {
  provider: 'youtube',
  videoId: 'dQw4w9WgXcQ',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  title: 'How a Fourier transform works',
  duration: 1800,
  hasAds: false,
}

async function makeHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'observer-session-'))
}

/** A throwaway home directory, removed when the test ends. */
export async function newHome(t: TestContext): Promise<string> {
  const home = await makeHome()
  t.after(() => rm(home, { recursive: true, force: true }))
  return home
}

/** A store with one session in it, closed and removed when the test ends. */
export async function openSession(
  t: TestContext,
  settings: NewSessionInput['settings'] = {},
): Promise<{ home: string; store: SessionStore; session: Session }> {
  const home = await makeHome()
  const store = createStore({ home })
  const session = await store.create({ source: SOURCE, settings })
  t.after(async () => {
    await store.close()
    await rm(home, { recursive: true, force: true })
  })
  return { home, store, session }
}
