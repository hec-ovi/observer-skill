/**
 * Records leave this box frozen. Reads are on the hot path (a position event every second),
 * so protection is paid for once per write rather than by copying on every read.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value
  if (Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}
