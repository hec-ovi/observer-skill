/**
 * What goes into `resolve` and what comes out of it.
 */

import * as z from 'zod/v4'

/** YouTube video ids are eleven characters of the URL-safe alphabet. */
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export const ResolveInput = z.object({
  /** Whatever the user pasted. */
  url: z.string().min(1),
  /** The user's answer to "does this video carry ads". */
  hasAds: z.boolean().default(false),
})

export const Source = z.object({
  provider: z.literal('youtube'),
  videoId: z.string().regex(VIDEO_ID),
  /** Canonical watch URL, whatever form was pasted. */
  url: z.url(),
  title: z.string(),
  channel: z.string(),
  /** Seconds. Null when the richer lookup could not run. */
  duration: z.number().int().nonnegative().nullable(),
  /** `YYYY-MM-DD`. Null when the richer lookup could not run. */
  publishedAt: z.iso.date().nullable(),
  /** Null when the richer lookup could not run, so "no captions" is never guessed. */
  hasCaptions: z.boolean().nullable(),
  captionLanguages: z.array(z.string()),
  hasAds: z.boolean(),
  embeddable: z.boolean(),
  /** True when only the keyless lookup answered, so the four fields above are unknown. */
  degraded: z.boolean(),
})

export type ResolveInput = z.input<typeof ResolveInput>
export type Source = z.infer<typeof Source>
