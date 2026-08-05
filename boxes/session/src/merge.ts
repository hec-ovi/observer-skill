import { isDeepStrictEqual } from 'node:util'
import type { DeepPartial } from './schema.ts'

type Plain = Record<string, unknown>

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergePlain(base: Plain, patch: Plain): Plain {
  const out: Plain = { ...base }
  for (const key of Object.keys(patch)) {
    const value = patch[key]
    if (value === undefined) continue
    const current = out[key]
    out[key] = isPlain(current) && isPlain(value) ? mergePlain(current, value) : value
  }
  return out
}

/**
 * Objects merge key by key, arrays and primitives replace whole, `undefined` leaves a key
 * alone. The patch is untyped because it often arrives off the wire; the caller validates
 * the result.
 */
export function deepMerge<T extends object>(base: T, patch: object): T {
  return mergePlain(base as Plain, patch as Plain) as T
}

function diffPlain(before: Plain, after: Plain): Plain {
  const out: Plain = {}
  for (const key of Object.keys(after)) {
    const a = before[key]
    const b = after[key]
    if (isDeepStrictEqual(a, b)) continue
    out[key] = isPlain(a) && isPlain(b) ? diffPlain(a, b) : b
  }
  return out
}

/** Only what moved, nested as deep as the change goes. */
export function diff<T extends object>(before: T, after: T): DeepPartial<T> {
  return diffPlain(before as Plain, after as Plain) as DeepPartial<T>
}
