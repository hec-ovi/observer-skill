import * as z from 'zod/v4'
import { fail } from '#errors'
import { sessionSchema } from '#session'
import { openInBrowser } from '../browser.ts'
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
    const { store, ingest, host, config } = call.runtime.deps

    const source = await ingest.resolve({ url: input.url, hasAds: input.hasAds })
    if (!source.embeddable) {
      fail(
        'SOURCE_NOT_EMBEDDABLE',
        `${source.title || source.url} cannot be played inside our page.`,
        'Ask the user for another link; this one will never load in the player.',
      )
    }

    const settings: { extraKnowledge?: boolean; toolkit?: boolean } = {}
    if (input.extraKnowledge !== undefined) settings.extraKnowledge = input.extraKnowledge
    if (input.toolkit !== undefined) settings.toolkit = input.toolkit

    const created = await store.create({
      source,
      settings,
      userPrompt: input.userPrompt ?? null,
    })
    await store.touchAgent(created.id)

    const { url } = await host.start()
    const pageUrl = `${url}/s/${created.id}`
    const session = await store.advance(created.id, 'transcribing')

    if (config.openBrowser) openInBrowser(pageUrl)
    call.runtime.transcriptions.start(session)

    return { sessionId: session.id, pageUrl, source: session.source }
  },
})
