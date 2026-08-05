/** A visual, in the shape the authoring guide promises: it draws, and it restyles in place. */

import type { ArtifactCtx } from '@stage/index.ts'

export const meta = { title: 'Where attention goes', kind: 'diagram' as const }

export function mount(el: HTMLElement, ctx: ArtifactCtx): () => void {
  const panel = document.createElement('p')
  panel.dataset['testid'] = 'panel-mode'
  panel.textContent = ctx.theme.mode
  ctx.onTheme((next) => {
    panel.textContent = next.mode
  })
  el.append(panel)

  return () => {
    panel.remove()
  }
}
