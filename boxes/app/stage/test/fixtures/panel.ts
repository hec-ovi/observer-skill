/**
 * A module in the shape the authoring guide promises: it draws, restyles when the theme
 * changes, follows the size it is given, and undoes all of it on the way out.
 *
 * The mount counter is module state on purpose: a theme change that remounted the artifact
 * would move it.
 */

import type { ArtifactCtx, ArtifactSize } from '../../src/types.ts'

export const meta = { title: 'Panel', kind: 'diagram' as const }

let mounts = 0

function readable(size: ArtifactSize): string {
  return `${size.width}x${size.height}`
}

export function mount(el: HTMLElement, ctx: ArtifactCtx): () => void {
  mounts += 1

  const panel = document.createElement('div')
  panel.dataset.testid = 'panel'
  panel.style.color = ctx.theme.text

  const line = (testid: string, text: string): HTMLElement => {
    const node = document.createElement('p')
    node.dataset.testid = testid
    node.textContent = text
    panel.append(node)
    return node
  }

  line('panel-mounts', String(mounts))
  line('panel-time', String(ctx.time))
  const mode = line('panel-mode', ctx.theme.mode)
  const size = line('panel-size', readable(ctx.size))

  // Charts hang layers off the document. They have to go when the artifact does.
  const overlay = document.createElement('div')
  overlay.dataset.testid = 'panel-overlay'
  document.body.append(overlay)

  ctx.onTheme((next) => {
    mode.textContent = next.mode
    panel.style.color = next.text
  })
  ctx.onResize((next) => {
    size.textContent = readable(next)
  })

  el.append(panel)

  return () => {
    overlay.remove()
  }
}
