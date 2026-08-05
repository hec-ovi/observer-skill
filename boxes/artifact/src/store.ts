/**
 * Where a built bundle lands. The path is derived from the session and the artifact id, so
 * rebuilding a fixed artifact replaces it instead of piling up.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fail } from '#errors'

/** A bundle carries its own inline source map; past this it is data, not a visual. */
export const MAX_BUNDLE_BYTES = 2 * 1024 * 1024

/** Beside the rest of the session's files, so removing a session removes its artifacts. */
export function bundlePathFor(home: string, sessionId: string, id: string): string {
  return join(home, 'sessions', sessionId, 'artifacts', `${id}.js`)
}

export function guardSize(contents: Uint8Array): void {
  if (contents.byteLength <= MAX_BUNDLE_BYTES) return
  const kb = Math.round(contents.byteLength / 1024)
  fail(
    'ARTIFACT_TOO_LARGE',
    `The built artifact is ${kb} KB, over the ${MAX_BUNDLE_BYTES / 1024} KB limit.`,
    'Cut the data written into the module: aggregate or sample the series, then build again.',
  )
}

export async function writeBundle(path: string, contents: Uint8Array): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    fail(
      'STORE_UNWRITABLE',
      `The artifact bundle could not be written to ${path}: ${reason}`,
      'Point OBSERVER_HOME at a writable directory and build again.',
    )
  }
}
