/**
 * What the stage is handed, what an artifact module is, and what verification reports.
 */

import type { ThemeTokens } from '@app/theme.ts'

/** One visual the page can put on the stage. */
export interface Artifact {
  id: string
  title: string
  caption?: string
  /** The built module, served by `web-host`. */
  url: string
}

export interface ArtifactSize {
  width: number
  height: number
}

/** The second argument `mount` is called with. */
export interface ArtifactCtx {
  theme: ThemeTokens
  onTheme(listener: (theme: ThemeTokens) => void): void
  /** The video second the artifact was opened at. */
  time: number
  size: ArtifactSize
  onResize(listener: (size: ArtifactSize) => void): void
}

export type ArtifactTeardown = () => void

/** The shape the artifact authoring guide promises, as far as the stage is concerned. */
export interface ArtifactModule {
  mount(el: HTMLElement, ctx: ArtifactCtx): ArtifactTeardown | void
}

export interface VerifyRequest {
  requestId: string
  /** The built module, served by `web-host`. */
  url: string
  timeoutMs?: number
}

export interface VerifyResult {
  requestId: string
  ok: boolean
  /** One line each, in the order they happened. Empty when `ok`. */
  errors: string[]
  size: ArtifactSize
  /** A PNG data URL of what was drawn. */
  snapshot?: string
}

export interface Verifier {
  verify(request: VerifyRequest): void
}
