import * as z from 'zod/v4'
import { settingsPatchSchema } from '#session'

/**
 * Everything that arrives from the page or the browser's address bar, validated here so a
 * route never reads an unchecked field.
 */

const playerState = z.enum(['idle', 'playing', 'paused', 'buffering', 'ended'])

/** What verification reports back, whoever produced it. */
export const verifyOutcomeSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()).default([]),
  size: z
    .object({ width: z.number().min(0), height: z.number().min(0) })
    .default({ width: 0, height: 0 }),
  snapshot: z.string().nullable().default(null),
})
export type VerifyResult = z.infer<typeof verifyOutcomeSchema>

/** One upstream event, as the page posts it to `/live/:id/event`. */
export const upstreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('position'),
    time: z.number().min(0),
    state: playerState,
  }),
  z.object({
    type: z.literal('ask'),
    text: z.string().min(1),
    at: z.number().min(0).default(0),
    via: z.enum(['text', 'voice']).default('text'),
  }),
  z.object({
    type: z.literal('settings'),
    at: z.number().min(0).default(0),
    settings: settingsPatchSchema,
  }),
  verifyOutcomeSchema.extend({
    type: z.literal('verify-result'),
    requestId: z.string().min(1),
  }),
])
export type UpstreamEvent = z.infer<typeof upstreamEventSchema>

/** `POST /api/session`: a URL, and whatever the user chose in the page. */
export const createSessionInputSchema = z.object({
  url: z.string().min(1),
  settings: settingsPatchSchema.optional(),
  userPrompt: z.string().nullable().default(null),
})
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>

/** `GET /api/session/:id/transcript?from&to&offset&limit`. */
export const transcriptQuerySchema = z.object({
  from: z.coerce.number().min(0).optional(),
  to: z.coerce.number().min(0).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().positive().max(1000).default(200),
})
export type TranscriptQuery = z.infer<typeof transcriptQuerySchema>
