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
      motionMs: Number.parseFloat(read('--motion')) || 0,
    }
  }

  #resolve(): ResolvedTheme {
    if (this.#mode !== 'system') return this.#mode
    return this.#media?.matches ? 'dark' : 'light'
  }

  #apply(): void {
    const next = this.#resolve()
    document.documentElement.setAttribute('data-theme', next)
    if (next === this.#resolved) return
    this.#resolved = next
    for (const listener of this.#listeners) listener(next)
  }
}

export const theme = new ThemeController()
