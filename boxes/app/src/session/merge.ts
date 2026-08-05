/**
 * Applying a patch to the record the page holds.
 *
 * The rule is the store's: objects are merged key by key, arrays and primitives are replaced
 * whole. A patch never carries a field it did not change, so anything absent stays as it was.
 */

import type { DeepPartial } from './record.ts'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function mergePatch<T>(base: T, patch: DeepPartial<T>): T {
  if (!isObject(base) || !isObject(patch)) return patch as T

  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = merged[key]
    merged[key] = isObject(value) && isObject(current) ? mergePatch(current, value) : value
  }
  return merged as T
}
