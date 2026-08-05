/** A module that fails the moment it is drawn. */

export const meta = { title: 'Throws', kind: 'chart' as const }

export function mount(): () => void {
  throw new TypeError("cannot read properties of undefined (reading 'map')")
}
