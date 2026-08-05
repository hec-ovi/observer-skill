/** What every provider is. A new one is this shape in a file plus a line in the registry. */

import type { Source } from '#ingest'

import type { ProgressFn, ProviderId, Segment } from './schema.ts'

export interface ProviderContext {
  /** The language the caller asked for, or undefined to take what the source offers. */
  language?: string | undefined
  /** Path to the subtitle file the user supplied, for the `file` provider. */
  file?: string | undefined
  /** A scratch directory this call owns; it is removed when the call ends. */
  scratch: string
  report: ProgressFn
}

export type Availability = { ok: true } | { ok: false; missing: string; hint: string }

export interface ProviderResult {
  segments: Segment[]
  language: string
  /** True for machine captions and speech recognition, false for words a human wrote. */
  generated: boolean
}

/** Null means "nothing here, try the next one", and `note` says why. */
export interface ProviderOutcome {
  result: ProviderResult | null
  note: string
}

export interface Provider {
  id: ProviderId
  available(context: ProviderContext): Promise<Availability>
  fetch(source: Source, context: ProviderContext): Promise<ProviderOutcome>
}

export function nothing(note: string): ProviderOutcome {
  return { result: null, note }
}

export function produced(result: ProviderResult, note: string): ProviderOutcome {
  return { result, note }
}
