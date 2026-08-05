import * as z from 'zod/v4'
import { requireBuilt } from '../artifacts.ts'
import { sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

export const show = defineTool({
  name: 'show',
  description:
    'Move the stage from the video to a built visual, without saying anything. To show one ' +
    'alongside an answer, pass its id to `say` instead.',
  phases: ['live'],
  input: z.object({
    sessionId: sessionIdInput,
    artifactId: z.string().min(1),
  }),
  output: z.object({
    shown: z.string().nullable(),
  }),

  async run(input, call) {
    const session = call.require()
    requireBuilt(session, input.artifactId)
    call.runtime.deps.store.signal(session.id, { type: 'show', artifactId: input.artifactId })
    return { shown: input.artifactId }
  },
})
