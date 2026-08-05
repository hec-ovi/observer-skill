/**
 * The richer lookup. It adds duration, publish date and the caption list, and it confirms
 * the player's verdict. Everything here is optional by design: the package may be absent,
 * the request may time out, YouTube may challenge us. Any of those returns null and the
 * caller keeps what the keyless lookup already established.
 */

import type { Innertube } from 'youtubei.js'
import { fetchWithin, withDeadline } from './deadline.ts'
import { readPlayability, type Verdict } from './playability.ts'
import { parsePublished } from './published.ts'

const TIMEOUT_MS = 8000

/**
 * The mobile client answers the player request without a proof-of-origin token, which is
 * what the browser-shaped clients now demand.
 */
const CLIENT = 'IOS'

export interface Details {
  duration: number | null
  publishedAt: string | null
  captionLanguages: string[]
  verdict: Verdict
}

let client: Promise<Innertube> | null = null

/**
 * One session per process, generated locally so creating it costs no round trip.
 *
 * `retrieve_player` is on because the player response is what carries the caption list and
 * the playability verdict. Without it every client answers UNPLAYABLE with no tracks, which
 * reads exactly like a video that has no captions.
 */
function innertube(): Promise<Innertube> {
  client ??= (async () => {
    const { Innertube } = await import('youtubei.js')
    return Innertube.create({
      fetch: fetchWithin,
      lang: 'en',
      generate_session_locally: true,
      retrieve_innertube_config: false,
      retrieve_player: true,
      enable_session_cache: false,
    })
  })().catch((error: unknown) => {
    client = null
    throw error
  })
  return client
}

export async function lookupDetails(videoId: string): Promise<Details | null> {
  try {
    const info = await withDeadline(TIMEOUT_MS, async () => {
      const yt = await innertube()
      return yt.getInfo(videoId, { client: CLIENT })
    })

    const languages = (info.captions?.caption_tracks ?? []).map((track) => track.language_code)

    return {
      duration: info.basic_info.duration ?? null,
      publishedAt: parsePublished(info.primary_info?.published?.text),
      captionLanguages: [...new Set(languages)],
      verdict: readPlayability({
        status: info.playability_status?.status,
        reason: info.playability_status?.reason,
        embeddable: info.playability_status?.embeddable,
      }),
    }
  } catch (error) {
    console.error('[ingest] richer lookup unavailable:', (error as Error).message)
    return null
  }
}
