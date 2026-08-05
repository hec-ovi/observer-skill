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
  border: string
  series: string[]
}

const SERIES_COUNT = 8

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
