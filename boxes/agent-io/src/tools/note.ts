import * as z from 'zod/v4'
import { NOTE_KINDS } from '#knowledge'
import { sessionIdInput } from '../schema.ts'
import { defineTool } from '../tool.ts'

const noteInput = z.object({
  kind: z
    .enum(NOTE_KINDS)
    .describe('`current` for something that changed after the video was recorded.'),
  text: z.string().min(1).describe('The answer already written, not a summary of a page.'),
  source: z.string().nullable().optional().describe('A link, when the claim is contestable.'),
})

export const note = defineTool({
  name: 'note',
  description:
    'Attach research to a concept, so the answer is already written when the user pauses. ' +
    'Notes are appended and never edited.',
  phases: ['researching', 'building', 'ready', 'live'],
  input: z.object({
    sessionId: sessionIdInput,
    conceptId: z.string().min(1).describe('The concept id `concepts` returned.'),
    notes: z.array(noteInput).min(1),
  }),
  output: z.object({
    conceptId: z.string(),
    noteCount: z.number().int(),
  }),

  async run(input, call) {
    const session = call.require()
    const { knowledge } = call.runtime.deps

    let concept = null
    for (const entry of input.notes) {
      concept = await knowledge.addNote(session.id, input.conceptId, {
        kind: entry.kind,
        text: entry.text,
        source: entry.source ?? null,
      })
    }

    return { conceptId: input.conceptId, noteCount: concept?.notes.length ?? 0 }
  },
})
