import { randomBytes } from 'node:crypto'

/**
 * A short opaque id: lowercase hex, so it is safe as a path segment, safe as a URL
 * segment, and free of the case-folding collisions a base64 alphabet would bring on a
 * case-insensitive filesystem.
 */
export function newId(bytes = 6): string {
  return randomBytes(bytes).toString('hex')
}
