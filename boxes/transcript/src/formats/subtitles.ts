/**
 * WebVTT and SubRip. One parser: they differ in the header, the decimal comma, and the cue
 * identifier, and share everything that matters.
 *
 * YouTube's automatic VTT is a rolling two-line window that restates the previous line in
 * every cue, with ten-millisecond flush cues in between and karaoke tags inside the text.
 * The flush cues are dropped here; the restated words are dropped by the normalizer's
 * overlap pass, which `rolling` asks for.
 *
 * Only the karaoke tags turn `rolling` on. They are what a rolling track always carries, and
 * the overlap pass deletes real repeats anywhere else.
 */

import type { Cue, Word } from '../normalize.ts'
import { tidy } from '../text.ts'

export interface ParsedSubtitles {
  cues: Cue[]
  /** True for a rolling automatic track, which needs the overlap pass. */
  rolling: boolean
}

const TIMING = /(\d+:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d+:)?\d{1,2}:\d{2}[.,]\d{1,3}/
const STAMP = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/
const INLINE = /<(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})>/g
const HAS_INLINE = /<(?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3}>/
/** The flush cue YouTube emits between rolling windows. */
const FLUSH_SECONDS = 0.02

function stamp(value: string): number | null {
  const m = STAMP.exec(value)
  if (!m) return null
  const [, h, mm, ss, ms] = m
  return Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + Number((ms ?? '0').padEnd(3, '0')) / 1000
}

interface Run {
  t: number | null
  text: string
}

/** Split a cue payload on its karaoke tags, so tagged words keep the time they were given. */
function runs(payload: string): Run[] {
  const out: Run[] = []
  let last = 0
  let time: number | null = null
  INLINE.lastIndex = 0
  for (let m = INLINE.exec(payload); m !== null; m = INLINE.exec(payload)) {
    out.push({ t: time, text: payload.slice(last, m.index) })
    const [, h, mm, ss, ms] = m
    time = Number(h ?? 0) * 3600 + Number(mm) * 60 + Number(ss) + Number((ms ?? '0').padEnd(3, '0')) / 1000
    last = m.index + m[0].length
  }
  out.push({ t: time, text: payload.slice(last) })
  return out
}

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, '')
}

/** Words with a time, when the cue carried karaoke tags. Empty otherwise: interpolate. */
function timedWords(payload: string, start: number, end: number): Word[] {
  if (!HAS_INLINE.test(payload)) return []
  const parts = runs(payload)
    .map((run) => ({ t: run.t, words: tidy(stripTags(run.text)).split(/\s+/).filter(Boolean) }))
    .filter((run) => run.words.length > 0)

  const out: Word[] = []
  for (const [i, part] of parts.entries()) {
    const from = part.t ?? start
    const to = parts.slice(i + 1).find((p) => p.t !== null)?.t ?? end
    const span = Math.max(0, to - from)
    for (const [j, word] of part.words.entries()) {
      out.push({ t: from + (span * j) / part.words.length, w: word })
    }
  }
  return out
}

export function parseSubtitles(source: string): ParsedSubtitles {
  const blocks = source.replace(/\r\n?/g, '\n').split(/\n{2,}/)
  const cues: Cue[] = []
  let tagged = false

  for (const block of blocks) {
    const lines = block.split('\n')
    const at = lines.findIndex((line) => TIMING.test(line))
    if (at === -1) continue
    const timing = lines[at] ?? ''
    const [rawStart, rawEnd] = timing.split('-->')
    const start = stamp(rawStart ?? '')
    const end = stamp(rawEnd ?? '')
    if (start === null || end === null) continue
    if (end - start < FLUSH_SECONDS) continue

    const payload = lines.slice(at + 1).join('\n')
    if (HAS_INLINE.test(payload)) tagged = true
    const text = tidy(stripTags(payload))
    if (text.length === 0) continue
    cues.push({ start, end, text, words: timedWords(payload, start, end) })
  }

  cues.sort((a, b) => a.start - b.start)
  return { cues, rolling: tagged }
}
