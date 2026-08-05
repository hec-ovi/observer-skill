import * as z from 'zod/v4'
import { countsOf, countsSchema } from '../counts.ts'
import { sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

export const ready = defineTool({
  name: 'ready',
  description:
    'Close preparation and unlock the player. Call it when the concepts are worth watching ' +
    'with, even if the research or the visuals are unfinished.',
  phases: ['researching', 'building'],
  input: z.object({ sessionId: sessionIdInput }),
  output: z.object({
    counts: countsSchema,
    pageUrl: z.string().nullable(),
  }),

  async run(_input, call) {
    const session = call.require()
    const unlocked = await call.runtime.deps.store.advance(session.id, 'ready')
    return { counts: countsOf(unlocked), pageUrl: call.runtime.pageUrl(unlocked.id) }
  },
})
