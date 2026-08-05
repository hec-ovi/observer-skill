/**
 * The same words the fetcher binary would get, in process, needing nothing installed.
 *
 * The platform's own player response lists every caption track with the url its player
 * reads. That url serves the same `json3` the binary asks for, so this provider fetches it
 * and hands it to the one normalizer both routes share.
 *
 * It does not use the transcript-panel endpoint: that endpoint answers 400 for every client
 * (WEB, MWEB, IOS, ANDROID and TV, checked 2026-08-05), while the track urls in the same
 * player response serve captions fine.
 *
 * The player response is the whole point. Created without it, every client reports the video
 * unplayable and hands back an empty track list, which reads exactly like a video that has
 * no captions at all.
 */

import { Innertube } from 'youtubei.js'

import type { Source } from '#ingest'

import { json3ToCues } from '../formats/json3.ts'
import { cuesToSegments } from '../normalize.ts'
import type { Availability, Provider, ProviderContext, ProviderOutcome } from '../provider.ts'
import { broke, nothing, produced } from '../provider.ts'

type Info = Awaited<ReturnType<Innertube['getInfo']>>
type Captions = NonNullable<Info['captions']>
type Track = NonNullable<Captions['caption_tracks']>[number]

/** A human wrote it, or a machine did. `asr` is the platform's word for the machine. */
function isGenerated(track: Track): boolean {
  return track.kind === 'asr'
}

/**
 * The track the player itself would turn on: the caption the video's own default audio
 * track names. A talk with thirty translations lists them alphabetically, so the first one
 * is whatever language happens to sort first, not the one being spoken.
 */
function published(captions: Captions): Track | undefined {
  const tracks = captions.caption_tracks ?? []
  const audio = captions.audio_tracks?.[captions.default_audio_track_index ?? 0]
  const index = audio?.default_caption_track_index
  return index === undefined ? undefined : tracks[index]
}

/**
 * The track to read: the language asked for, else the one the video publishes as its own. A
 * human-written track wins over a machine one for the same language.
 */
function choose(captions: Captions, language: string | undefined): Track | undefined {
  const tracks = captions.caption_tracks ?? []
  const wanted = language?.split('-')[0]?.toLowerCase()
  const matching = wanted
    ? tracks.filter((track) => track.language_code.split('-')[0]?.toLowerCase() === wanted)
    : []
  if (matching.length > 0) return matching.find((track) => !isGenerated(track)) ?? matching[0]
  return published(captions) ?? tracks.find((track) => !isGenerated(track)) ?? tracks[0]
}

export const innertube: Provider = {
  id: 'innertube',

  available(): Promise<Availability> {
    return Promise.resolve({ ok: true })
  },

  async fetch(source: Source, context: ProviderContext): Promise<ProviderOutcome> {
    context.report({
      step: 'innertube',
      done: 0,
      total: 0,
      message: 'asking for the caption tracks',
    })

    let captions: Captions | undefined
    try {
      const client = await Innertube.create({
        // Without the player response every client answers UNPLAYABLE with no tracks.
        retrieve_player: true,
        generate_session_locally: true,
        enable_session_cache: false,
        fetch: (input, init) => globalThis.fetch(input, init),
        ...(context.language ? { lang: context.language } : {}),
      })
      const info = await client.getInfo(source.videoId)
      captions = info.captions
    } catch (error) {
      return broke(error instanceof Error ? error.message : String(error))
    }

    const track = captions === undefined ? undefined : choose(captions, context.language)
    if (track === undefined) return nothing('this video publishes no caption track')

    let doc: unknown
    try {
      const answer = await globalThis.fetch(`${track.base_url}&fmt=json3`)
      // The caption endpoint rate limits by address, and says so with a 429. It is worth its
      // own wording: nothing is wrong with the video, and trying again later works.
      if (answer.status === 429) {
        return broke('the caption endpoint is rate limiting this machine; it clears on its own')
      }
      if (!answer.ok) return broke(`the caption track answered ${answer.status}`)
      doc = await answer.json()
    } catch (error) {
      return broke(error instanceof Error ? error.message : String(error))
    }

    const segments = cuesToSegments(json3ToCues(doc))
    if (segments.length === 0) return nothing('the caption track was empty')

    context.report({
      step: 'innertube',
      done: 0,
      total: 0,
      message: `read ${segments.length} lines of captions`,
    })

    return produced(
      { segments, language: track.language_code, generated: isGenerated(track) },
      `${segments.length} segments from the caption track`,
    )
  },
}
