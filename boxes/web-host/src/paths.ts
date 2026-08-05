import { resolve, sep } from 'node:path'
import { fail } from '#errors'

/**
 * A file that belongs to one session. Record paths are relative to `home`; this resolves
 * one and refuses anything that lands outside that session's own folder, so a crafted
 * record or a crafted URL cannot read the rest of the disk.
 */
export function sessionFile(home: string, sessionId: string, relativePath: string): string {
  const root = resolve(home, 'sessions', sessionId)
  const target = resolve(home, relativePath)
  if (target !== root && !target.startsWith(root + sep)) {
    fail(
      'UNKNOWN_ARTIFACT',
      `That file is outside session ${sessionId}.`,
      'Rebuild the artifact so its path lands inside the session folder.',
    )
  }
  return target
}
