/** A module built against a library the page does not serve. It never gets to run. */

// @ts-expect-error the package is absent on purpose: that is what this fixture proves.
import 'echarts-not-in-the-registry'

export const meta = { title: 'Missing library', kind: 'chart' as const }

export function mount(el: HTMLElement): () => void {
  el.textContent = 'unreachable'
  return () => {}
}
