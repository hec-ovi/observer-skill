import * as z from 'zod/v4'
import { rangeOf } from '../range.ts'
import { seconds, sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

export const link = defineTool({
  name: 'link',
  description:
    'Bind a visual to its concept and the stretch of video where it means something. ' +
    'A visual linked to nothing is never shown.',
  phases: ['building', 'ready', 'live'],
  input: z.object({
    sessionId: sessionIdInput,
    artifactId: z.string().min(1),
    conceptId: z.string().min(1),
    startsAt: seconds.optional().describe('Overrides the concept’s own range for this visual.'),
    endsAt: seconds.optional(),
  }),
  output: z.object({
    artifactId: z.string(),
    conceptId: z.string(),
  }),

  async run(input, call) {
    const session = call.require()
    const range = rangeOf(input.startsAt, input.endsAt)

    await call.runtime.deps.knowledge.linkArtifact(
      session.id,
      input.conceptId,
      input.artifactId,
      range,
    )
    return { artifactId: input.artifactId, conceptId: input.conceptId }
  },
})
