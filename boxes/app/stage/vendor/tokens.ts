/**
 * The design tokens a chart theme is built from, read off the page's own custom properties
 * so the charts and the chrome around them can never drift.
 *
 * Both modes are read by stamping `data-theme` on the root, reading, and putting it back.
 * The two reads happen in the same task, so nothing is painted in between.
 */

export interface VizTokens {
  dark: boolean
  font: string
  text: string
  textDim: string
  surface: string
  /** The hairline that separates: quiet, for grid lines behind the data. */
  border: string
  /** The same hairline with enough contrast to read as an axis or an edge. */
  borderStrong: string
  /** `--radius` in CSS pixels, because chart options take numbers. */
  radius: number
  /** `--shadow-2`, for the tooltip, which is a DOM element and takes CSS. */
  shadow: string
  series: string[]
}

const SERIES_COUNT = 8

/** A length token in CSS pixels. The scale is written in rem; ECharts wants a number. */
function pixels(value: string, rootFontSize: string): number {
  const length = Number.parseFloat(value)
  if (!Number.isFinite(length)) return 0
  return value.endsWith('rem') ? length * (Number.parseFloat(rootFontSize) || 0) : length
}

function readCurrent(): Omit<VizTokens, 'dark'> {
  const style = getComputedStyle(document.documentElement)
  const value = (name: string): string => style.getPropertyValue(name).trim()

  const series: string[] = []
  for (let index = 1; index <= SERIES_COUNT; index += 1) {
    const colour = value(`--series-${index}`)
    if (colour) series.push(colour)
  }

  return {
    font: value('--font-sans'),
    text: value('--text'),
    textDim: value('--text-dim'),
    surface: value('--surface'),
    border: value('--border'),
    borderStrong: value('--border-strong'),
    radius: pixels(value('--radius'), style.fontSize),
    shadow: value('--shadow-2'),
    series,
  }
}

/** The token values of one mode, whichever mode the document is currently showing. */
export function readVizTokens(mode: 'light' | 'dark'): VizTokens {
  const root = document.documentElement
  const previous = root.getAttribute('data-theme')
  root.setAttribute('data-theme', mode)
  try {
    return { dark: mode === 'dark', ...readCurrent() }
  } finally {
    if (previous === null) root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', previous)
  }
}
