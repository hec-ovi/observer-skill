/**
 * The contract surface of this box: what a caller may pass in, and what it gets back.
 * Inputs are validated here; outputs are produced here and never re-validated.
 */

import * as z from 'zod/v4'

export const PROVIDER_IDS = ['captions', 'innertube', 'endpoint-asr', 'file'] as const

export const ProviderIdSchema = z.enum(PROVIDER_IDS)
export type ProviderId = z.infer<typeof ProviderIdSchema>

export const ProviderChoiceSchema = z.enum([...PROVIDER_IDS, 'auto'])
export type ProviderChoice = z.infer<typeof ProviderChoiceSchema>

/** Safe as a path segment and as a URL segment, which is what `session` promises. */
const SessionIdSchema = z.string().regex(/^[A-Za-z0-9._-]+$/, 'session id must be path safe')

export const SegmentSchema = z.object({
  i: z.number().int().nonnegative(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
})
export type Segment = z.infer<typeof SegmentSchema>

/** The file at `$home/sessions/<id>/transcript.json`. Segments come first so it can stream. */
export const TranscriptDocSchema = z.object({
  segments: z.array(SegmentSchema),
  provider: ProviderIdSchema,
  language: z.string(),
  generated: z.boolean(),
  duration: z.number(),
  segmentCount: z.number().int().nonnegative(),
})
export type TranscriptDoc = z.infer<typeof TranscriptDocSchema>

export interface TranscriptRef {
  provider: ProviderId
  language: string
  segmentCount: number
  duration: number
  generated: boolean
}

export interface TranscriptPage {
  segments: Segment[]
  offset: number
  total: number
  nextOffset?: number
}

export interface TranscriptWindow {
  at: number
  segment: Segment
  before: Segment[]
  after: Segment[]
  text: string
}

export interface Progress {
  step: string
  done: number
  total: number
  message: string
}

export type ProgressFn = (progress: Progress) => void

export const FetchOptionsSchema = z.object({
  home: z.string().min(1),
  sessionId: SessionIdSchema,
  provider: ProviderChoiceSchema.optional(),
  language: z.string().min(1).optional(),
  file: z.string().min(1).optional(),
})

export interface FetchOptions extends z.infer<typeof FetchOptionsSchema> {
  onProgress?: ProgressFn
}

export const ReadOptionsSchema = z.object({
  from: z.number().nonnegative().optional(),
  to: z.number().nonnegative().optional(),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().positive().optional(),
})
export type ReadOptions = z.input<typeof ReadOptionsSchema>

export const AtOptionsSchema = z.object({
  back: z.number().nonnegative().default(90),
  forward: z.number().nonnegative().default(30),
})
export type AtOptions = z.input<typeof AtOptionsSchema>
