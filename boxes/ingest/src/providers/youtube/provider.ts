/**
 * The YouTube provider: it claims a URL, then answers whether the video behind it can be
 * watched and transcribed.
 *
 * Order matters. The keyless lookup rules on existence and embedding, because it needs no
 * install and answers in one request. The richer lookup then adds facts and may escalate to
 * a refusal, but only when it says something about the video itself.
 */

import { fail } from '#errors'
import { PASTE_ANOTHER, PICK_ANOTHER, RETRY_LATER } from '../../hints.ts'
import { checkEmbeddable } from './oembed.ts'
import { lookupDetails } from './details.ts'
import { parseVideoId, watchUrl } from './url.ts'
import type { Source } from '../../schema.ts'
import type { EmbedCheck } from './oembed.ts'
import type { Details } from './details.ts'

type Refusal = Extract<EmbedCheck, { ok: false }>['reason']

function refuse(reason: Refusal): never {
  switch (reason) {
    case 'embedding-disabled':
      fail(
        'SOURCE_NOT_EMBEDDABLE',
        'The owner disabled embedding for this video, so it cannot play inside the study page.',
        PICK_ANOTHER,
      )
    case 'not-found':
      fail('SOURCE_UNAVAILABLE', 'This video is private, deleted, or does not exist.', PICK_ANOTHER)
    case 'bad-id':
      fail('BAD_SOURCE', 'YouTube does not recognise that video id.', PASTE_ANOTHER)
    case 'unreachable':
      fail('PROVIDER_UNAVAILABLE', 'YouTube did not answer the embed check.', RETRY_LATER)
  }
}

/** Everything only the richer lookup can settle. */
type Facts = Pick<
  Source,
  'duration' | 'publishedAt' | 'hasCaptions' | 'captionLanguages' | 'degraded'
>

const UNKNOWN: Facts = {
  duration: null,
  publishedAt: null,
  hasCaptions: null,
  captionLanguages: [],
  degraded: true,
}

function facts(details: Details | null): Facts {
  if (details === null) return UNKNOWN

  const { verdict } = details
  if (verdict.kind === 'unavailable') fail('SOURCE_UNAVAILABLE', verdict.message, verdict.hint)
  if (verdict.kind === 'not-embeddable') refuse('embedding-disabled')
  if (verdict.kind === 'refused') return UNKNOWN

  return {
    duration: details.duration,
    publishedAt: details.publishedAt,
    hasCaptions: details.captionLanguages.length > 0,
    captionLanguages: details.captionLanguages,
    degraded: false,
  }
}

async function resolve(url: string, hasAds: boolean): Promise<Source> {
  const videoId = parseVideoId(url)
  if (videoId === null) {
    fail('BAD_SOURCE', `Not a YouTube video link: ${url}`, PASTE_ANOTHER)
  }

  const embed = await checkEmbeddable(videoId)
  if (!embed.ok) refuse(embed.reason)

  return {
    provider: 'youtube',
    videoId,
    url: watchUrl(videoId),
    title: embed.title,
    channel: embed.channel,
    hasAds,
    embeddable: true,
    ...facts(await lookupDetails(videoId)),
  }
}

export const youtube = {
  id: 'youtube',
  matches: (url: string) => parseVideoId(url) !== null,
  resolve,
}
