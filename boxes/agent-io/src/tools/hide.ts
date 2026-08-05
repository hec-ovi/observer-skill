import * as z from 'zod/v4'
import { sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

export const hide = defineTool({
  name: 'hide',
  description: 'Move the stage back to the video. Nothing is said and nothing is logged.',
  phases: ['live'],
  input: z.object({ sessionId: sessionIdInput }),
  output: z.object({
    shown: z.string().nullable(),
  }),

  async run(_input, call) {
    const session = call.require()
    call.runtime.deps.store.signal(session.id, { type: 'hide' })
    return { shown: null }
  },
})
