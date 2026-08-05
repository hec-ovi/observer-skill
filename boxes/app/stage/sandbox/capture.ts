/**
 * A PNG of whatever the module drew, in three tries.
 *
 * Exact first: ECharts hands over its own pixels, and a lone canvas can be read straight
 * off. Everything else (D3's SVG, KaTeX's HTML, plain DOM, mixtures) goes through
 * `modern-screenshot`, which clones the subtree, inlines the styles and fonts, and
 * rasterises it through a `data:` URI, the one form of SVG that never taints a canvas.
 */

import { domToPng } from 'modern-screenshot'

const PIXEL_RATIO = 2
const RENDER_WAIT_MS = 2000

interface ChartInstance {
  isDisposed(): boolean
  getDataURL(options: { type: 'png'; pixelRatio: number; backgroundColor: string }): string
  on(event: string, handler: () => void): void
  off(event: string, handler: () => void): void
}

interface ChartLibrary {
  getInstanceByDom(el: HTMLElement): ChartInstance | undefined
}

/** The registry's one copy of ECharts, if an artifact loaded it. */
function chartIn(root: HTMLElement): ChartInstance | null {
  const library = (globalThis as { echarts?: ChartLibrary }).echarts
  if (!library) return null
  const child = root.firstElementChild
  const chart =
    library.getInstanceByDom(root) ??
    (child instanceof HTMLElement ? library.getInstanceByDom(child) : undefined)
  return chart && !chart.isDisposed() ? chart : null
}

/** Charts animate. Wait for the render to settle, but never hang the run on it. */
function finished(chart: ChartInstance): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      chart.off('finished', done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, RENDER_WAIT_MS)
    chart.on('finished', done)
  })
}

export async function capture(root: HTMLElement, background: string): Promise<string> {
  const chart = chartIn(root)
  if (chart) {
    await finished(chart)
    const url = chart.getDataURL({ type: 'png', pixelRatio: PIXEL_RATIO, backgroundColor: background })
    // Under the SVG renderer `type` is ignored and this comes back as SVG; fall through.
    if (url.startsWith('data:image/png')) return url
  }

  const canvases = root.querySelectorAll('canvas')
  const only = canvases.length === 1 ? canvases[0] : null
  if (only && root.children.length === 1) {
    try {
      return only.toDataURL('image/png')
    } catch {
      // A tainted canvas cannot be read. Rasterise the DOM instead.
    }
  }

  return await domToPng(root, {
    scale: PIXEL_RATIO,
    backgroundColor: background,
    features: { removeControlCharacter: true },
  })
}
