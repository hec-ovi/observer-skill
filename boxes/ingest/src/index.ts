/**
 * ingest: a pasted URL becomes a source, and the caller learns straight away whether the
 * video can be watched and transcribed.
 */

import { fail } from '#errors'
import { ResolveInput } from './schema.ts'
import { PASTE_ANOTHER } from './hints.ts'
import { pickProvider } from './registry.ts'
import type { Source } from './schema.ts'

export { ResolveInput, Source } from './schema.ts'

export async function resolve(input: ResolveInput): Promise<Source> {
  const parsed = ResolveInput.safeParse(input)
  if (!parsed.success) {
    fail('BAD_SOURCE', 'A source needs a url to resolve.', PASTE_ANOTHER)
  }

  const { url, hasAds } = parsed.data
  const provider = pickProvider(url)
  if (provider === null) {
    fail('BAD_SOURCE', `No provider recognises this link: ${url}`, PASTE_ANOTHER)
  }

  return provider.resolve(url, hasAds)
}
