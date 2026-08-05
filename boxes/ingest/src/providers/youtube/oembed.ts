/**
 * The keyless lookup. One request, no account, CORS-open, and its status codes are the
 * clean signal for "does this video exist and will an embed load it".
 */

import { watchUrl } from './url.ts'

const ENDPOINT = 'https://www.youtube.com/oembed'
const TIMEOUT_MS = 8000

export type EmbedCheck =
  | { ok: true; title: string; channel: string }
  | { ok: false; reason: 'embedding-disabled' | 'not-found' | 'bad-id' | 'unreachable' }

interface OEmbedBody {
  title?: unknown
  author_name?: unknown
}

/** Status to meaning, verified against the live endpoint. */
function refusal(status: number): EmbedCheck {
  if (status === 401 || status === 403) return { ok: false, reason: 'embedding-disabled' }
  if (status === 404) return { ok: false, reason: 'not-found' }
  if (status === 400) return { ok: false, reason: 'bad-id' }
  return { ok: false, reason: 'unreachable' }
}

export async function checkEmbeddable(videoId: string): Promise<EmbedCheck> {
  const url = `${ENDPOINT}?url=${encodeURIComponent(watchUrl(videoId))}&format=json`

  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    return { ok: false, reason: 'unreachable' }
  }

  if (!response.ok) return refusal(response.status)

  let body: OEmbedBody
  try {
    body = (await response.json()) as OEmbedBody
  } catch {
    return { ok: false, reason: 'unreachable' }
  }

  return {
    ok: true,
    title: typeof body.title === 'string' ? body.title : videoId,
    channel: typeof body.author_name === 'string' ? body.author_name : '',
  }
}
