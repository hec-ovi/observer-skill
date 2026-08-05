/**
 * Where the pieces of an install sit. Development runs from the source tree and npm installs
 * the published one; these are the two things whose location differs between them.
 */

import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Absolute path from a specifier relative to this file. */
function at(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url))
}

function readVersion(): string {
  try {
    const manifest = JSON.parse(readFileSync(at('../package.json'), 'utf8')) as { version?: string }
    return manifest.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** What the MCP server reports to its client and what `/healthz` answers with. */
export const VERSION = readVersion()

/**
 * The built page `web-host` serves. `./app` is the published layout, where this file is
 * `dist/observer.js` beside it; `../dist/app` is the source tree.
 */
export function appDir(): string {
  const published = at('./app')
  return existsSync(published) ? published : at('../dist/app')
}
