/**
 * The picture verification took, written beside the bundle so the page can serve it and the
 * agent can look at it again later.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const DATA_URL = /^data:image\/png;base64,/

export interface Snapshot {
  path: string
  base64: string
}

/** Accepts the PNG data URL the page reports, or bare base64. */
export async function writeSnapshot(
  file: string,
  snapshot: string | null,
): Promise<Snapshot | null> {
  if (snapshot === null || snapshot.length === 0) return null
  const base64 = snapshot.replace(DATA_URL, '')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, Buffer.from(base64, 'base64'))
  return { path: file, base64 }
}

export function artifactsDir(home: string, sessionId: string): string {
  return join(home, 'sessions', sessionId, 'artifacts')
}
