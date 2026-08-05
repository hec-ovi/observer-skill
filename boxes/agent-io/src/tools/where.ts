import * as z from 'zod/v4'
import { contextAt, contextView } from '../context.ts'
import { playerState, seconds, sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

export const where = defineTool({
  name: 'where',
  description:
    'Where the user is right now, with the transcript around that second and the concepts ' +
    'covering it. Use it for a question typed in the terminal instead of the page.',
  phases: ['live'],
  input: z.object({ sessionId: sessionIdInput }),
  output: contextView.extend({
    time: seconds,
    state: playerState,
  }),

  async run(_input, call) {
    const session = call.require()
    const { time, state } = session.position
    return { time, state, ...contextAt(call.runtime, session.id, time) }
  },
})
