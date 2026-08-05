/**
 * One chunk of audio to an OpenAI-compatible transcription route.
 *
 * `verbose_json` with word and segment granularity is the only shape that comes back with
 * times, which is the entire point here. Word times are passed on when the server sends
 * them, and the normalizer decides whether they are trustworthy enough to use; either way
 * the chunk's offset is added before the caller sees it.
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

import type { Cue, Word } from '../normalize.ts'
import { tidy } from '../text.ts'

export interface TranscribeRequest {
  url: string
  key: string | null
  model: string
  language?: string | undefined
  /** The tail of the previous chunk, which steadies proper nouns across a seam. */
  prompt?: string | undefined
}

export interface TranscribeFailure {
  error: string
}

interface VerboseWord {
  word?: unknown
  start?: unknown
  end?: unknown
}

interface VerboseSegment {
  text?: unknown
  start?: unknown
  end?: unknown
  words?: unknown
}

interface VerboseResponse {
  language?: unknown
  text?: unknown
  segments?: unknown
  words?: unknown
}

/** The endpoint is given as a base; the route is the standard one. */
function transcriptionUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, '')
  if (trimmed.endsWith('/audio/transcriptions')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/audio/transcriptions`
  return `${trimmed}/v1/audio/transcriptions`
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function words(list: unknown, offset: number): Word[] {
  if (!Array.isArray(list)) return []
  const out: Word[] = []
  for (const entry of list as VerboseWord[]) {
    const start = num(entry.start)
    const text = typeof entry.word === 'string' ? tidy(entry.word) : ''
    if (start === null || text.length === 0) continue
    out.push({ t: start + offset, w: text })
  }
  return out
}

/** The response as cues on the video's own timeline. */
function verboseToCues(body: unknown, offset: number): Cue[] {
  const response = (body ?? {}) as VerboseResponse
  const list = Array.isArray(response.segments) ? (response.segments as VerboseSegment[]) : []
  const loose = words(response.words, offset)

  const cues: Cue[] = []
  for (const segment of list) {
    const start = num(segment.start)
    const text = typeof segment.text === 'string' ? tidy(segment.text) : ''
    if (start === null || text.length === 0) continue
    const end = num(segment.end)
    const own = words(segment.words, offset)
    const inside = own.length > 0 ? own : loose.filter((w) => w.t >= start + offset && (end === null || w.t < end + offset))
    cues.push({ start: start + offset, end: end === null ? null : end + offset, text, words: inside })
  }

  if (cues.length === 0 && typeof response.text === 'string' && tidy(response.text).length > 0) {
    const last = loose[loose.length - 1]
    cues.push({
      start: loose[0]?.t ?? offset,
      end: last ? last.t : null,
      text: tidy(response.text),
      words: loose,
    })
  }
  return cues
}

export async function transcribeChunk(
  path: string,
  offset: number,
  request: TranscribeRequest,
): Promise<{ cues: Cue[]; language: string | null } | TranscribeFailure> {
  const body = new FormData()
  body.set('file', new Blob([await readFile(path)], { type: 'audio/wav' }), basename(path))
  body.set('model', request.model)
  body.set('response_format', 'verbose_json')
  body.append('timestamp_granularities[]', 'segment')
  body.append('timestamp_granularities[]', 'word')
  body.set('temperature', '0')
  if (request.language) body.set('language', request.language)
  if (request.prompt) body.set('prompt', request.prompt)

  let response: Response
  try {
    response = await fetch(transcriptionUrl(request.url), {
      method: 'POST',
      body,
      headers: request.key ? { authorization: `Bearer ${request.key}` } : {},
    })
  } catch (error) {
    return { error: `the transcription endpoint could not be reached: ${(error as Error).message}` }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return { error: `the transcription endpoint answered ${response.status} ${detail.slice(0, 200)}`.trim() }
  }

  const parsed: unknown = await response.json().catch(() => null)
  if (parsed === null) return { error: 'the transcription endpoint did not answer with JSON' }

  const language = (parsed as VerboseResponse).language
  return {
    cues: verboseToCues(parsed, offset),
    language: typeof language === 'string' ? language : null,
  }
}
