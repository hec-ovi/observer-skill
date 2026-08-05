/**
 * Pasted text to a video id. Pure: no network, no state.
 */

import { VIDEO_ID } from '../../schema.ts'

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])
const SHORT_HOSTS = new Set(['youtu.be', 'www.youtu.be'])

/** Path prefixes that carry the id as the next segment. */
const PATH_FORMS = ['embed', 'shorts', 'live']

function id(candidate: string | undefined): string | null {
  return candidate !== undefined && VIDEO_ID.test(candidate) ? candidate : null
}

/** A pasted string with no scheme still parses if it starts with a host we know. */
function asUrl(pasted: string): URL | null {
  const trimmed = pasted.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(withScheme)
  } catch {
    return null
  }
}

/** The video id, or null when this is not a YouTube video link. */
export function parseVideoId(pasted: string): string | null {
  const bare = id(pasted.trim())
  if (bare) return bare

  const url = asUrl(pasted)
  if (!url) return null

  const host = url.hostname.toLowerCase()

  if (SHORT_HOSTS.has(host)) {
    return id(url.pathname.split('/')[1])
  }

  if (!HOSTS.has(host)) return null

  const segments = url.pathname.split('/').filter((s) => s.length > 0)
  const [first, second] = segments

  // watch?v=ID, including a playlist URL that carries one.
  if (first === 'watch') return id(url.searchParams.get('v') ?? undefined)

  if (first !== undefined && PATH_FORMS.includes(first)) return id(second)

  return null
}

/** The form every other box and the player receive. */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}
