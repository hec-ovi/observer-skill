import * as z from 'zod/v4'
import { sessionSchema } from '#session'
import type { SettingsPatch } from '#session'
import { openSession } from '../open-session.ts'
import { defineTool } from '../tool.ts'

export const open = defineTool({
  name: 'open',
  description:
    'Start a session from a video link: resolves the source, opens the study page in the ' +
    "user's browser, and starts transcription. The first call of every session.",
  phases: ['feed'],
  input: z.object({
    url: z.string().min(1).describe('The link the user pasted.'),
    hasAds: z.boolean().optional().describe('True when the video carries sponsor reads.'),
    extraKnowledge: z.boolean().optional().describe('Run the research pass. On by default.'),
    toolkit: z.boolean().optional().describe('Build visuals. On by default.'),
    userPrompt: z
      .string()
      .optional()
      .describe('What the user wants from this video, in their own words.'),
  }),
  output: z.object({
    sessionId: z.string(),
    pageUrl: z.string(),
    source: sessionSchema.shape.source,
  }),

  async run(input, call) {
    const settings: SettingsPatch = {}
    if (input.extraKnowledge !== undefined) settings.extraKnowledge = input.extraKnowledge
    if (input.toolkit !== undefined) settings.toolkit = input.toolkit

    // The page opens sessions through this same call, so there is one open path and a
    // session started either way is the same session.
    const opened = await openSession(call.runtime, {
      url: input.url,
      hasAds: input.hasAds ?? false,
      settings,
      userPrompt: input.userPrompt ?? null,
    })

    return {
      sessionId: opened.session.id,
      pageUrl: opened.pageUrl,
      source: opened.session.source,
    }
  },
})
