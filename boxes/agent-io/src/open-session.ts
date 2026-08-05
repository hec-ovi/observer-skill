/**
 * Opening a session, in one place. The `open` tool and the page's own feed screen both land
 * here, so a video the user pasted in the browser starts exactly the session the agent would
 * have started, in the same phase, with the same run behind it.
 */

import { fail } from '#errors'
import type { Session, SettingsPatch } from '#session'
import { openInBrowser } from './browser.ts'
import type { Runtime } from './runtime.ts'
import { pageUrlFor } from './runtime.ts'

export interface OpenSessionInput {
  /** The link the user pasted. */
  url: string
  /** The user's word that this video carries sponsor reads. */
  hasAds?: boolean
  /** What the user chose before opening it. Anything left out keeps its default. */
  settings?: SettingsPatch
  /** What the user wants from this video, in their own words. */
  userPrompt?: string | null
  /** Put the page in front of the user. Defaults to the process setting. */
  openBrowser?: boolean
}

export interface OpenedSession {
  session: Session
  /** Where this session lives on the listener, which is up by the time this comes back. */
  pageUrl: string
}

export async function openSession(
  runtime: Runtime,
  input: OpenSessionInput,
): Promise<OpenedSession> {
  const { store, ingest, host, config } = runtime.deps

  const source = await ingest.resolve({ url: input.url, hasAds: input.hasAds })
  if (!source.embeddable) {
    fail(
      'SOURCE_NOT_EMBEDDABLE',
      `${source.title || source.url} cannot be played inside our page.`,
      'Ask the user for another link; this one will never load in the player.',
    )
  }

  const created = await store.create({
    source,
    settings: input.settings ?? {},
    userPrompt: input.userPrompt ?? null,
  })
  await store.touchAgent(created.id)

  const { url } = await host.start()
  const pageUrl = pageUrlFor(url, created.id)
  const session = await store.advance(created.id, 'transcribing')

  if (input.openBrowser ?? config.openBrowser) openInBrowser(pageUrl)
  runtime.transcriptions.start(session)

  return { session, pageUrl }
}
