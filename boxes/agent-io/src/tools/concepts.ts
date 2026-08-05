import * as z from 'zod/v4'
import { CONCEPT_KINDS } from '#knowledge'
import { seconds, sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

const conceptInput = z.object({
  label: z.string().min(1).describe('The term as the speaker says it, not a paraphrase.'),
  kind: z.enum(CONCEPT_KINDS),
  startsAt: seconds.describe('First second this is live in the video.'),
  endsAt: seconds.describe('Last second it is still being built on.'),
  summary: z
    .string()
    .optional()
    .describe('The answer to "what is this", in one breath. Left out, the stored one stays.'),
})

export const concepts = defineTool({
  name: 'concepts',
  description:
    'Write or merge the concept list: what the video assumes and never explains, with the ' +
    'stretch of video each one covers. Writing the same label twice widens it, never duplicates it.',
  phases: ['researching', 'building', 'ready', 'live'],
  input: z.object({
    sessionId: sessionIdInput,
    concepts: z.array(conceptInput).min(1),
  }),
  output: z.object({
    written: z.array(z.object({ id: z.string(), label: z.string() })),
    total: z.number().int(),
  }),

  async run(input, call) {
    const session = call.require()
    const written = await call.runtime.deps.knowledge.writeConcepts(session.id, input.concepts)
    return {
      written: written.map((concept) => ({ id: concept.id, label: concept.label })),
      total: call.runtime.deps.store.get(session.id).concepts.length,
    }
  },
})
