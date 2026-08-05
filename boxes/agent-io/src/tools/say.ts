import * as z from 'zod/v4'
import { requireBuilt } from '../artifacts.ts'
import { sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

export const say = defineTool({
  name: 'say',
  description:
    'Send an answer to the page, optionally read aloud and optionally showing a visual in ' +
    'the same beat. The answer always goes out before anything is authored.',
  phases: ['live'],
  input: z.object({
    sessionId: sessionIdInput,
    text: z.string().min(1),
    speak: z.boolean().optional().describe("Read it aloud in the user's chosen voice."),
    artifactId: z.string().min(1).optional().describe('Show this visual with the answer.'),
  }),
  output: z.object({
    entryId: z.string(),
  }),

  async run(input, call) {
    const session = call.require()
    const { store } = call.runtime.deps

    if (input.artifactId !== undefined) requireBuilt(session, input.artifactId)

    const speak = input.speak ?? false
    const artifactId = input.artifactId ?? null
    const written = await store.appendLog(session.id, {
      role: 'agent',
      text: input.text,
      at: session.position.time,
      artifactId,
      spoken: speak,
    })

    const entry = written.log.at(-1)
    if (entry === undefined) throw new Error('The answer did not reach the log')

    store.signal(session.id, {
      type: 'say',
      entryId: entry.id,
      text: input.text,
      speak,
      artifactId,
    })
    return { entryId: entry.id }
  },
})
