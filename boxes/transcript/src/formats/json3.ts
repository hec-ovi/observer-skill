/**
 * YouTube's json3 caption format. Each text event carries only new words: the rolling window
 * is expressed as separate `aAppend` events that hold nothing but a newline, so dropping
 * those is the whole de-duplication story here. No fuzzy matching, and none is wanted: a
 * speaker who says the same phrase twice keeps both.
 */

import type { Cue, Word } from '../normalize.ts'
import { tidy } from '../text.ts'

interface Json3Seg {
  utf8?: unknown
  tOffsetMs?: unknown
}

interface Json3Event {
  tStartMs?: unknown
  dDurationMs?: unknown
  aAppend?: unknown
  segs?: unknown
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function isJson3(doc: unknown): boolean {
  return typeof doc === 'object' && doc !== null && Array.isArray((doc as { events?: unknown }).events)
}

export function json3ToCues(doc: unknown): Cue[] {
  const events: Json3Event[] = isJson3(doc) ? ((doc as { events: Json3Event[] }).events ?? []) : []
  const cues: Cue[] = []

  for (const event of events) {
    if (!Array.isArray(event.segs)) continue // window definition, no text
    if (event.aAppend) continue // rolling continuation, restates nothing new
    const segs = event.segs as Json3Seg[]
    const start = (num(event.tStartMs) ?? 0) / 1000
    const perWord = segs.some((seg) => num(seg.tOffsetMs) !== null)

    const parts: string[] = []
    const words: Word[] = []
    for (const seg of segs) {
      const raw = typeof seg.utf8 === 'string' ? seg.utf8 : ''
      if (raw.length === 0) continue
      parts.push(raw)
      if (!perWord) continue
      const token = tidy(raw)
      if (token.length > 0) words.push({ t: start + (num(seg.tOffsetMs) ?? 0) / 1000, w: token })
    }

    const text = tidy(parts.join(''))
    if (text.length === 0) continue
    const duration = num(event.dDurationMs)
    cues.push({ start, end: duration === null ? null : start + duration / 1000, text, words })
  }

  return cues
}
