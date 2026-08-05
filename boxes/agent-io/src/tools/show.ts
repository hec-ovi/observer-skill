import * as z from 'zod/v4'
import { requireBuilt } from '../artifacts.ts'
import { sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

export const show = defineTool({
  name: 'show',
  description:
    'Move the stage to a built visual, and speak the narration it was built with, if it has ' +
    'one. To show a visual alongside an answer instead, pass its id to `say`.',
  phases: ['live'],
  input: z.object({
    sessionId: sessionIdInput,
    artifactId: z.string().min(1),
  }),
  output: z.object({
    shown: z.string().nullable(),
    /** What the page speaks as the visual goes up, written at `build` time. */
    narration: z.string().nullable(),
  }),

  async run(input, call) {
    const session = call.require()
    const artifact = requireBuilt(session, input.artifactId)
    // The narration rides the record, not the signal: the page already holds the artifact
    // it was told to show, and a reload keeps what a transient message would have lost.
    call.runtime.deps.store.signal(session.id, { type: 'show', artifactId: input.artifactId })
    return { shown: input.artifactId, narration: artifact.narration }
  },
})
