/**
 * What goes into `build` and what comes back. The module the agent wrote is never parsed
 * with these: it is read from its AST, because it must not run. These describe the call.
 */

import * as z from 'zod/v4'

/** The four things an artifact is allowed to be. */
export const ARTIFACT_KINDS = ['chart', 'dataviz', 'diagram', 'simulation'] as const

export const ArtifactKindSchema = z.enum(ARTIFACT_KINDS)
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>

/** Ids become one path segment each, so they stay to letters, digits, dot, dash, underscore. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export const BuildInputSchema = z.object({
  sessionId: z.string().regex(NAME, 'sessionId must be letters, digits, dot, dash or underscore.'),
  id: z.string().regex(NAME, 'id must be letters, digits, dot, dash or underscore.'),
  source: z.string().min(1, 'source is empty; pass the module text.'),
  home: z.string().min(1, 'home must be the directory the session writes into.'),
})
export type BuildInput = z.infer<typeof BuildInputSchema>

export const BuildErrorSchema = z.object({
  /** `check` is a rule the module broke; `bundle` is esbuild refusing to build it. */
  stage: z.enum(['check', 'bundle']),
  message: z.string(),
  /** 1-based, against the source that was submitted. */
  line: z.number().int().positive().optional(),
  /** 1-based, against the source that was submitted. */
  column: z.number().int().positive().optional(),
  /** The offending source line with a caret under the column. */
  snippet: z.string().optional(),
  /** What to write instead, in one sentence. */
  fix: z.string().optional(),
})
export type BuildError = z.infer<typeof BuildErrorSchema>

export const BuildResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    bundlePath: z.string(),
    bytes: z.number().int().nonnegative(),
    warnings: z.array(z.string()),
  }),
  z.object({
    ok: z.literal(false),
    errors: z.array(BuildErrorSchema).min(1),
  }),
])
export type BuildResult = z.infer<typeof BuildResultSchema>
