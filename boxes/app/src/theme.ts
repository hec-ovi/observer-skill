/**
 * The theme: the user's choice, the system query, and the resolved value the page and every
 * artifact is drawn with.
 *
 * The choice is `light`, `dark`, or `system`. What lands on the root element is always
 * `light` or `dark`, matching the inline script in index.html so there is no flash. Changing
 * it notifies subscribers, which is how a mounted chart restyles without being rebuilt.
 */

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** The resolved token values, in the shape a chart library consumes. */
export interface ThemeTokens {
  mode: ResolvedTheme
  surface: string
  surfaceRaised: string
  text: string
  textDim: string
  border: string
  accent: string
  /** The categorical ramp, in order, for series colouring. */
  series: string[]
  /** Font stacks, for canvas and SVG text that cannot inherit CSS. */
  font: string
  fontMono: string
  /** Corner radius in CSS pixels, for anything an artifact draws its own box for. */
  radius: number
  /** Transition length in milliseconds; 0 under `prefers-reduced-motion`. */
  motionMs: number
}

export type ThemeListener = (resolved: ResolvedTheme) => void

const STORAGE_KEY = 'observer.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const SERIES_COUNT = 8

function isMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** A length token in CSS pixels. The scale is written in rem; canvas and SVG want a number. */
function pixels(value: string, rootFontSize: string): number {
  const length = Number.parseFloat(value)
  if (!Number.isFinite(length)) return 0
  return value.endsWith('rem') ? length * (Number.parseFloat(rootFontSize) || 0) : length
}

function storedMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isMode(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

class ThemeController {
  #mode: ThemeMode
  #resolved: ResolvedTheme
  #media: MediaQueryList | null
  #listeners = new Set<ThemeListener>()

  constructor() {
    this.#mode = storedMode()
    this.#media = typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null
    this.#resolved = this.#resolve()
    document.documentElement.setAttribute('data-theme', this.#resolved)

    this.#media?.addEventListener('change', () => {
      if (this.#mode === 'system') this.#apply()
    })
    // Another tab changed the choice.
    addEventListener('storage', (event) => {
      if (event.key !== STORAGE_KEY) return
      this.#mode = storedMode()
      this.#apply()
    })
  }

  /** What the user picked, `system` included. */
  mode = (): ThemeMode => this.#mode

  /** What the page is actually drawn with. */
  resolved = (): ResolvedTheme => this.#resolved

  /** Record the choice, stamp the root, and notify if the resolved theme moved. */
  set = (mode: ThemeMode): void => {
    this.#mode = mode
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // A page with storage blocked still themes correctly for this tab.
    }
    this.#apply()
  }

  subscribe = (listener: ThemeListener): (() => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /** Read the resolved custom properties off the root, once, into a plain object. */
  readTokens = (): ThemeTokens => {
    const style = getComputedStyle(document.documentElement)
    const read = (name: string): string => style.getPropertyValue(name).trim()

    const series: string[] = []
    for (let i = 1; i <= SERIES_COUNT; i += 1) {
      const colour = read(`--series-${i}`)
      if (colour) series.push(colour)
    }

    return {
      mode: this.#resolved,
      surface: read('--surface'),
      surfaceRaised: read('--surface-raised'),
      text: read('--text'),
      textDim: read('--text-dim'),
      border: read('--border'),
      accent: read('--accent'),
      series,
      font: read('--font-sans'),
      fontMono: read('--font-mono'),
      radius: pixels(read('--radius'), style.fontSize),
      motionMs: Number.parseFloat(read('--motion')) || 0,
    }
  }

  #resolve(): ResolvedTheme {
    if (this.#mode !== 'system') return this.#mode
    return this.#media?.matches ? 'dark' : 'light'
  }

  #apply(): void {
    const next = this.#resolve()
    const root = document.documentElement
    // The class eases colours across the switch. It is taken off again so it never slows an
    // ordinary hover, and it is skipped entirely under reduced motion.
    if (next !== this.#resolved && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('theming')
      setTimeout(() => root.classList.remove('theming'), 300)
    }
    root.setAttribute('data-theme', next)
    if (next === this.#resolved) return
    this.#resolved = next
    for (const listener of this.#listeners) listener(next)
  }
}

export const theme = new ThemeController()
