/**
 * The same words through the platform's own transcript panel, in process.
 *
 * A different route to the caption text than the fetcher binary takes, so it answers on
 * videos where that route is blocked, and it needs nothing installed. The panel hands back
 * caption windows with string milliseconds, which the normalizer re-cuts into sentences.
 *
 * The panel names the language it served; the player's own track list says what that track
 * is. `kind: 'asr'` there is the platform's word for "a machine wrote this".
 */

import { Innertube } from 'youtubei.js'

import type { Source } from '#ingest'

import type { Cue } from '../normalize.ts'
import { cuesToSegments } from '../normalize.ts'
import type { Availability, Provider, ProviderContext, ProviderOutcome } from '../provider.ts'
import { broke, nothing, produced } from '../provider.ts'
import { tidy } from '../text.ts'

interface PanelSegment {
  type?: string
  start_ms?: string
  end_ms?: string
  snippet?: { toString(): string }
}

type Info = Awaited<ReturnType<Innertube['getInfo']>>
type Panel = Awaited<ReturnType<Info['getTranscript']>>
type Track = NonNullable<NonNullable<Info['captions']>['caption_tracks']>[number]

const NO_PANEL = [
  'Cannot get transcript from basic video info.',
  'Engagement panels not found. Video likely has no transcript.',
  'Transcript panel not found. Video likely has no transcript.',
  'Transcript continuation not found.',
]

function toCues(segments: PanelSegment[]): Cue[] {
  const cues: Cue[] = []
  for (const segment of segments) {
    if (segment.type !== 'TranscriptSegment') continue
    const start = Number(segment.start_ms ?? NaN) / 1000
    const end = Number(segment.end_ms ?? NaN) / 1000
    if (!Number.isFinite(start)) continue
    const text = tidy(segment.snippet?.toString() ?? '')
    if (text.length === 0) continue
    cues.push({ start, end: Number.isFinite(end) ? end : null, text, words: [] })
  }
  return cues
}

/** The caption track the panel answered with, matched by the name the panel shows for it. */
function served(info: Info, panel: Panel): Track | undefined {
  const selected = panel.selectedLanguage
  if (selected.length === 0) return undefined
  return info.captions?.caption_tracks?.find((track) => track.name.toString() === selected)
}

export const innertube: Provider = {
  id: 'innertube',

  available(): Promise<Availability> {
    return Promise.resolve({ ok: true })
  },

  async fetch(source: Source, context: ProviderContext): Promise<ProviderOutcome> {
    context.report({ step: 'innertube', done: 0, total: 1, message: 'opening the transcript panel' })

    let info: Info
    let panel: Panel
    try {
      const client = await Innertube.create({
        retrieve_player: false,
        retrieve_innertube_config: false,
        generate_session_locally: true,
        enable_session_cache: false,
        fetch: (input, init) => globalThis.fetch(input, init),
        ...(context.language ? { lang: context.language } : {}),
      })
      info = await client.getInfo(source.videoId)
      panel = await info.getTranscript()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (NO_PANEL.includes(message)) return nothing('this video has no transcript panel')
      return broke(message)
    }

    const raw = (panel.transcript.content?.body?.initial_segments ?? []) as PanelSegment[]
    const segments = cuesToSegments(toCues(raw))
    context.report({ step: 'innertube', done: 1, total: 1, message: 'read the transcript panel' })
    if (segments.length === 0) return nothing('the transcript panel was empty')

    const track = served(info, panel)
    return produced(
      {
        segments,
        language: track?.language_code ?? context.language ?? source.captionLanguages[0] ?? 'unknown',
        generated: track ? track.kind === 'asr' : true,
      },
      `${segments.length} segments from the transcript panel`,
    )
  },
}
