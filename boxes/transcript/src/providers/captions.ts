/**
 * The platform's own caption track, fetched with the caption binary.
 *
 * Two passes, because manual captions and machine captions land in the same file name and
 * the difference matters to the agent: pass one asks for human subtitles only, pass two for
 * automatic ones. json3 is preferred over vtt, since json3 states the rolling window as
 * separate empty events instead of restating the previous line.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { Source } from '#ingest'

import { json3ToCues } from '../formats/json3.ts'
import { parseSubtitles } from '../formats/subtitles.ts'
import { cuesToSegments } from '../normalize.ts'
import type { Availability, Provider, ProviderContext, ProviderOutcome } from '../provider.ts'
import { nothing, produced } from '../provider.ts'
import { YTDLP_INSTALL, reason, ytdlp, ytdlpPresent } from '../ytdlp.ts'

interface Track {
  language: string
  file: string
}

function languageList(source: Source, asked: string | undefined): string {
  const wanted = asked ?? source.captionLanguages[0] ?? 'en'
  return `${wanted.split('-')[0]}.*,-live_chat`
}

/** `<id>.<lang>.<ext>`; the shortest language tag is the plain one, not a translation. */
function pick(files: string[], ext: string): string | null {
  const matching = files.filter((file) => file.endsWith(`.${ext}`)).sort((a, b) => a.length - b.length)
  return matching[0] ?? null
}

async function collect(dir: string): Promise<Track & { kind: 'json3' | 'vtt' } | null> {
  const files = await readdir(dir).catch(() => [])
  const json3 = pick(files, 'json3')
  const chosen = json3 ?? pick(files, 'vtt')
  if (!chosen) return null
  return {
    kind: json3 ? 'json3' : 'vtt',
    file: join(dir, chosen),
    language: chosen.split('.').at(-2) ?? 'unknown',
  }
}

async function pass(
  source: Source,
  context: ProviderContext,
  dir: string,
  automatic: boolean,
): Promise<{ segments: ReturnType<typeof cuesToSegments>; language: string } | { error: string } | null> {
  const outcome = await ytdlp([
    '--no-progress',
    '--no-playlist',
    '--skip-download',
    automatic ? '--write-auto-subs' : '--write-subs',
    '--sub-langs',
    languageList(source, context.language),
    '--sub-format',
    'json3/vtt',
    '--sleep-subtitles',
    '1',
    '-P',
    dir,
    '-o',
    '%(id)s.%(ext)s',
    source.url,
  ])

  if (outcome.kind === 'missing') return { error: 'the caption fetcher is not installed' }
  if (outcome.kind === 'failed') return { error: reason(outcome.stderr) }

  const track = await collect(dir)
  if (!track) return null

  const raw = await readFile(track.file, 'utf8')
  if (track.kind === 'json3') {
    return { segments: cuesToSegments(json3ToCues(JSON.parse(raw))), language: track.language }
  }
  const parsed = parseSubtitles(raw)
  return {
    segments: cuesToSegments(parsed.cues, { dedupeOverlap: parsed.rolling }),
    language: track.language,
  }
}

export const captions: Provider = {
  id: 'captions',

  async available(): Promise<Availability> {
    if (await ytdlpPresent()) return { ok: true }
    return { ok: false, missing: 'yt-dlp', hint: YTDLP_INSTALL }
  },

  async fetch(source: Source, context: ProviderContext): Promise<ProviderOutcome> {
    context.report({ step: 'captions', done: 0, total: 2, message: 'looking for published captions' })

    for (const [index, automatic] of [false, true].entries()) {
      const dir = join(context.scratch, automatic ? 'auto' : 'manual')
      const outcome = await pass(source, context, dir, automatic)
      context.report({
        step: 'captions',
        done: index + 1,
        total: 2,
        message: automatic ? 'reading machine captions' : 'reading published captions',
      })
      if (outcome === null) continue
      if ('error' in outcome) return nothing(outcome.error)
      if (outcome.segments.length === 0) continue
      return produced(
        { segments: outcome.segments, language: outcome.language, generated: automatic },
        `${outcome.segments.length} segments from ${automatic ? 'machine' : 'published'} captions`,
      )
    }

    return nothing('this video publishes no caption track we can read')
  },
}
