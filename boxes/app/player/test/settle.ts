/** Let the queued callbacks a provider uses to become ready run. */
export async function settle(): Promise<void> {
  for (let step = 0; step < 4; step += 1) await Promise.resolve()
}

/** A page element for a player to mount into. */
export function host(): HTMLElement {
  const el = document.createElement('div')
  document.body.append(el)
  return el
}
