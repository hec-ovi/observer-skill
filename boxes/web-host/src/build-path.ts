import { posix } from 'node:path'

/**
 * The file in the build a URL asks for, spelled one way.
 *
 * serve-static decodes and resolves before it reads, so `/%73andbox.html`, `//sandbox.html`
 * and `/./sandbox.html` all reach the same file as `/sandbox.html`. A guard that compares the
 * raw path misses every one of them. Folded to lower case because a build served from a
 * case-insensitive filesystem answers `/Sandbox.html` too.
 *
 * `null` when the URL cannot be decoded, which serve-static refuses on its own.
 */
export function buildPath(url: string): string | null {
  const pathname = url.split('?')[0] ?? '/'
  try {
    return posix.normalize(decodeURIComponent(pathname)).toLowerCase()
  } catch {
    return null
  }
}
