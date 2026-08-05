/**
 * One mounted module: the `ctx` it was given, the subscribers it registered, and its
 * teardown.
 *
 * The stage drives it from the page (theme, container size); the verifier drives it in the
 * frame at a fixed theme and size. Nothing else in the box knows what a module looks like.
 */

import type { ThemeTokens } from '@app/theme.ts'
import { StageError, describeError } from './errors.ts'
import type { ArtifactCtx, ArtifactModule, ArtifactSize, ArtifactTeardown } from './types.ts'

export interface RuntimeOptions {
  theme: ThemeTokens
  time: number
  size: ArtifactSize
}

/**
 * A module's callback threw. Hand it to the page's error handler rather than swallowing it
 * or letting it break the caller: the verify frame reports it, the page logs it, and the
 * artifact stays up.
 */
function deferThrow(error: unknown): void {
  setTimeout(() => {
    throw error
  })
}

export class ArtifactRuntime {
  readonly #el: HTMLElement
  readonly #module: ArtifactModule
  readonly #options: RuntimeOptions
  readonly #themeListeners: ((theme: ThemeTokens) => void)[] = []
  readonly #sizeListeners: ((size: ArtifactSize) => void)[] = []
  #teardown: ArtifactTeardown | null = null
  #live = false

  constructor(el: HTMLElement, module: ArtifactModule, options: RuntimeOptions) {
    this.#el = el
    this.#module = module
    this.#options = options
  }

  get live(): boolean {
    return this.#live
  }

  /** Draw it. Throws `ARTIFACT_MOUNT_FAILED`, with the element left empty. */
  mount(): void {
    if (this.#live) return
    const ctx: ArtifactCtx = {
      theme: this.#options.theme,
      onTheme: (listener) => {
        this.#themeListeners.push(listener)
      },
      time: this.#options.time,
      size: this.#options.size,
      onResize: (listener) => {
        this.#sizeListeners.push(listener)
      },
    }

    this.#live = true
    let teardown: ArtifactTeardown | void
    try {
      teardown = this.#module.mount(this.#el, ctx)
    } catch (cause) {
      this.unmount()
      throw new StageError('ARTIFACT_MOUNT_FAILED', `mount() threw: ${describeError(cause)}`, { cause })
    }
    this.#teardown = typeof teardown === 'function' ? teardown : null
  }

  /** The user switched light and dark. The module restyles; it is never remounted. */
  themeChanged(theme: ThemeTokens): void {
    for (const listener of this.#themeListeners) {
      try {
        listener(theme)
      } catch (error) {
        deferThrow(error)
      }
    }
  }

  resized(size: ArtifactSize): void {
    for (const listener of this.#sizeListeners) {
      try {
        listener(size)
      } catch (error) {
        deferThrow(error)
      }
    }
  }

  /** Idempotent, and the only way out. Runs the module's teardown, then empties the element. */
  unmount(): void {
    if (!this.#live) return
    this.#live = false
    const teardown = this.#teardown
    this.#teardown = null
    this.#themeListeners.length = 0
    this.#sizeListeners.length = 0
    try {
      teardown?.()
    } catch (error) {
      deferThrow(error)
    }
    this.#el.replaceChildren()
  }
}
