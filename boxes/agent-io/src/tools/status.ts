import * as z from 'zod/v4'
import { PHASES, sessionSchema } from '#session'
import type { Session } from '#session'
import { countsOf, countsSchema } from '../counts.ts'
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
    'Where the session stands: phase, progress, counts, what is still missing, whether a ' +
    "page is connected, and the user's own line about this video. Poll it while " +
    'transcription runs and call it after any interruption.',
  phases: PHASES,
  input: z.object({ sessionId: sessionIdInput }),
  output: z.object({
    sessionId: z.string(),
    progress: sessionSchema.shape.progress,
    error: sessionSchema.shape.error,
    counts: countsSchema,
    missing: z.array(z.string()),
    settings: sessionSchema.shape.settings,
    source: sessionSchema.shape.source,
    /** What the user wants from the video, in their words. Null when they said nothing. */
    userPrompt: sessionSchema.shape.userPrompt,
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
      counts: countsOf(session),
      missing: missingFor(session),
      settings: session.settings,
      source: session.source,
      userPrompt: session.userPrompt,
      pageUrl: call.runtime.pageUrl(session.id),
      pageOpen: host.hasPage(session.id),
    }
  },
})
