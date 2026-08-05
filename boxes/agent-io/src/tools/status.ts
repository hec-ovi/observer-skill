import * as z from 'zod/v4'
import { PHASES, sessionSchema } from '#session'
import type { Session } from '#session'
import { sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

/** What is still owed before the player can be unlocked, in the order to do it. */
function missingFor(session: Session): string[] {
  const missing: string[] = []
  if (session.transcript === null) missing.push('transcript')
  if (session.concepts.length === 0) missing.push('concepts')
  if (session.settings.extraKnowledge && session.concepts.some((c) => c.notes.length === 0)) {
    missing.push('notes')
  }
  const built = session.artifacts.filter((artifact) => artifact.status === 'built')
  if (session.settings.toolkit && built.length === 0) missing.push('visuals')
  if (built.some((artifact) => artifact.conceptId === null)) missing.push('links')
  if (session.phase !== 'ready' && session.phase !== 'live') missing.push('ready')
  return missing
}

export const status = defineTool({
  name: 'status',
  description:
    'Where the session stands: phase, progress, counts, what is still missing, and whether ' +
    'a page is connected. Poll this while transcription runs and after any interruption.',
  phases: PHASES,
  input: z.object({ sessionId: sessionIdInput }),
  output: z.object({
    sessionId: z.string(),
    progress: sessionSchema.shape.progress,
    error: sessionSchema.shape.error,
    counts: z.object({
      segments: z.number().int(),
      concepts: z.number().int(),
      notes: z.number().int(),
      artifacts: z.number().int(),
      answers: z.number().int(),
    }),
    missing: z.array(z.string()),
    settings: sessionSchema.shape.settings,
    source: sessionSchema.shape.source,
    pageUrl: z.string().nullable(),
    pageOpen: z.boolean(),
  }),

  async run(_input, call) {
    const session = call.require()
    const { host } = call.runtime.deps

    return {
      sessionId: session.id,
      progress: session.progress,
      error: session.error,
      counts: {
        segments: session.transcript?.segmentCount ?? 0,
        concepts: session.concepts.length,
        notes: session.concepts.reduce((total, concept) => total + concept.notes.length, 0),
        artifacts: session.artifacts.filter((artifact) => artifact.status === 'built').length,
        answers: session.log.filter((entry) => entry.role === 'agent').length,
      },
      missing: missingFor(session),
      settings: session.settings,
      source: session.source,
      pageUrl: call.runtime.pageUrl(session.id),
      pageOpen: host.hasPage(session.id),
    }
  },
})
