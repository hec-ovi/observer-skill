/**
 * Caption frames become sentences. Every word in, every word out, exactly once, in order.
 *
 * Three stages, validated against recorded caption files:
 *   1. the format parsers hand over cues (see `formats/`), which are closed here: a missing
 *      end becomes the next cue's start, and an end that runs past the next cue is clamped,
 *      which is what kills the rolling-window overlap;
 *   2. cues become a flat word stream with a time on every word;
 *   3. words become sentences, flushed on terminal punctuation, on a pause, or on length.
 *
 * A sound cue cuts the run: speech before it and speech after it are separate sentences, so
 * no sentence carries words from both sides of a music break.
 *
 * Per-word times are used only when they spell out the cue's own text. A server that hands
 * back token pieces (`sec`, `ond`) or a word list that lost a word at a segment edge is not
 * a word list; those cues are spread over the cue's own span instead.
 *
 * `dedupeOverlap` belongs to the VTT path alone. YouTube's rolling VTT restates the previous
 * line in every cue; json3 does not, so running it there deletes words the speaker really
 * said twice.
 */

import type { Segment } from './schema.ts'
import { MARKER, TERMINAL, joinWords, seconds, wordKey } from './text.ts'

export interface Word {
  /** Where the word starts, in seconds. */
  t: number
  w: string
}

export interface Cue {
  start: number
  /** Null when the format did not say; filled from the next cue. */
  end: number | null
  text: string
  /** Per-word times when the format carried them; empty when they must be interpolated. */
  words: Word[]
}

export interface NormalizeOptions {
  /** VTT only. Drops the run of words a rolling cue restates from the cue before it. */
  dedupeOverlap?: boolean
  gapSeconds?: number
  maxSeconds?: number
  maxWords?: number
  minWords?: number
}

interface Timed extends Word {
  key: string
  /** Where the next word starts, never later than the frame this word came from. */
  end: number
  cueEnd: number
}

const DEFAULTS = { gapSeconds: 0.8, maxSeconds: 14, maxWords: 48, minWords: 4 }

function isMarker(cue: Cue): boolean {
  return MARKER.test(cue.text)
}

/** Fill missing ends, clamp an end that overruns the next cue, and keep ends ordered. */
function closeCues(cues: Cue[]): Cue[] {
  for (const [i, cue] of cues.entries()) {
    const next = cues[i + 1]
    if (cue.end === null) cue.end = next ? next.start : cue.start + 2
    if (next && cue.end > next.start) cue.end = next.start
    if (cue.end < cue.start) cue.end = cue.start
  }
  return cues
}

/** Longest suffix of `have` that is also a prefix of `incoming`, capped so it stays cheap. */
function overlapLen(have: Timed[], incoming: Timed[], max = 12): number {
  const n = Math.min(max, have.length, incoming.length)
  for (let k = n; k > 0; k--) {
    let ok = true
    for (let i = 0; i < k; i++) {
      if (have[have.length - k + i]?.key !== incoming[i]?.key) {
        ok = false
        break
      }
    }
    if (ok) return k
  }
  return 0
}

function keys(words: string[]): string[] {
  return words.map(wordKey).filter((key) => key.length > 0)
}

/** True when the per-word list is the cue's own text, word for word. */
function spellsOut(words: Word[], text: string): boolean {
  const given = keys(words.map((word) => word.w))
  const said = keys(text.split(/\s+/))
  return given.length === said.length && given.every((key, i) => key === said[i])
}

function cueWords(cue: Cue): Timed[] {
  const end = cue.end ?? cue.start
  const raw: Word[] = spellsOut(cue.words, cue.text)
    ? cue.words
    : cue.text.split(/\s+/).map((w, i, all) => ({
        t: cue.start + ((end - cue.start) * i) / Math.max(1, all.length),
        w,
      }))
  return raw
    .map((word) => ({ ...word, key: wordKey(word.w), end, cueEnd: end }))
    .filter((word) => word.key.length > 0)
}

/**
 * Stage 2. Cues become one word stream. A word ends where the next one starts, but never
 * later than its own frame, so a pause between frames stays a pause.
 */
function cuesToWords(cues: Cue[], options: NormalizeOptions = {}): Timed[] {
  const out: Timed[] = []
  for (const cue of cues) {
    const words = cueWords(cue)
    if (words.length === 0) continue
    const skip = options.dedupeOverlap ? overlapLen(out, words) : 0
    for (const word of words.slice(skip)) out.push(word)
  }
  for (const [i, word] of out.entries()) {
    const next = out[i + 1]
    word.end = Math.max(word.t, next ? Math.min(next.t, word.cueEnd) : word.cueEnd)
  }
  return out
}

/** Stage 3. Words become sentences where the text allows, and blocks where it does not. */
function wordsToSentences(words: Timed[], options: NormalizeOptions = {}): Segment[] {
  const gap = options.gapSeconds ?? DEFAULTS.gapSeconds
  const maxSeconds = options.maxSeconds ?? DEFAULTS.maxSeconds
  const maxWords = options.maxWords ?? DEFAULTS.maxWords
  const minWords = options.minWords ?? DEFAULTS.minWords

  const out: Segment[] = []
  let buffer: Timed[] = []

  const flush = (): void => {
    const first = buffer[0]
    const last = buffer[buffer.length - 1]
    if (!first || !last) return
    out.push({
      i: out.length,
      start: seconds(first.t),
      end: seconds(Math.max(last.end, first.t)),
      text: joinWords(buffer.map((word) => word.w)),
    })
    buffer = []
  }

  for (const [i, word] of words.entries()) {
    buffer.push(word)
    const next = words[i + 1]
    const first = buffer[0]
    const span = first ? word.end - first.t : 0
    const bigGap = next ? next.t - word.end > gap : true
    if (TERMINAL.test(word.w) && buffer.length >= 2) flush()
    else if (buffer.length >= maxWords || span >= maxSeconds) flush()
    else if (bigGap && buffer.length >= minWords) flush()
  }
  flush()
  return out
}

/** Consecutive identical sound cues are one marker, not a stutter. */
function pushMarker(out: Segment[], cue: Cue): void {
  const previous = out[out.length - 1]
  if (previous && previous.text === cue.text && cue.start - previous.end <= 0.5) {
    previous.end = seconds(Math.max(previous.end, cue.end ?? cue.start))
    return
  }
  out.push({ i: 0, start: seconds(cue.start), end: seconds(cue.end ?? cue.start), text: cue.text })
}

/**
 * The whole normalizer. Sound cues keep their own segments so the agent can see the silence,
 * and they end the sentence they interrupt; everything else is re-cut into sentences.
 */
export function cuesToSegments(cues: Cue[], options: NormalizeOptions = {}): Segment[] {
  const closed = closeCues(cues.filter((cue) => cue.text.length > 0))
  const out: Segment[] = []
  let speech: Cue[] = []

  const flushSpeech = (): void => {
    if (speech.length === 0) return
    out.push(...wordsToSentences(cuesToWords(speech, options), options))
    speech = []
  }

  for (const cue of closed) {
    if (!isMarker(cue)) {
      speech.push(cue)
      continue
    }
    flushSpeech()
    pushMarker(out, cue)
  }
  flushSpeech()

  out.sort((a, b) => a.start - b.start || a.end - b.end)
  for (const [i, segment] of out.entries()) {
    segment.i = i
    const next = out[i + 1]
    if (next && segment.end > next.start) segment.end = next.start
    if (segment.end < segment.start) segment.end = segment.start
  }
  return out
}
