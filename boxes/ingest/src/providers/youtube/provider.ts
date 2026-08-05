/**
 * The YouTube provider: it claims a URL, then answers whether the video behind it can be
 * watched and transcribed.
 *
 * Order matters. The keyless lookup rules on existence and embedding, because it needs no
 * install and answers in one request. The richer lookup then adds facts and may escalate to
 * a refusal, but only when it says something about the video itself.
 */

import { fail } from '#errors'
import type { Source } from '../../schema.ts'
import { checkEmbeddable, type EmbedCheck } from './oembed.ts'
import { lookupDetails, type Details } from './details.ts'
import { parseVideoId, watchUrl } from './url.ts'

const PASTE_ANOTHER =
  'Paste a YouTube watch link, a youtu.be link, or an eleven-character video id.'
const PICK_ANOTHER = 'Pick another video, or paste a link you can open while signed out.'

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
      fail(
        'PROVIDER_UNAVAILABLE',
        'YouTube did not answer the embed check.',
        'Check the network connection and try the same link again.',
      )
  }
}

/** What the richer lookup would have filled in, when it could not run. */
const UNKNOWN = {
  duration: null,
  publishedAt: null,
  hasCaptions: null,
  captionLanguages: [],
  degraded: true,
} as const

function fill(details: Details): Omit<Source, keyof typeof BASE_KEYS> {
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

/** The fields the keyless lookup already settled. */
const BASE_KEYS = {
  provider: true,
  videoId: true,
  url: true,
  title: true,
  channel: true,
  hasAds: true,
  embeddable: true,
} as const

async function resolve(url: string, hasAds: boolean): Promise<Source> {
  const videoId = parseVideoId(url)
  if (videoId === null) {
    fail('BAD_SOURCE', `Not a YouTube video link: ${url}`, PASTE_ANOTHER)
  }

  const embed = await checkEmbeddable(videoId)
  if (!embed.ok) refuse(embed.reason)

  const details = await lookupDetails(videoId)

  return {
    provider: 'youtube',
    videoId,
    url: watchUrl(videoId),
    title: embed.title,
    channel: embed.channel,
    hasAds,
    embeddable: true,
    ...(details === null ? UNKNOWN : fill(details)),
  }
}

export const youtube = {
  id: 'youtube',
  matches: (url: string) => parseVideoId(url) !== null,
  resolve,
}
