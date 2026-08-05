/**
 * The transcript file and the index over it.
 *
 * Writing streams: segments go to disk one at a time and the file is never built as one
 * string, so a three-hour podcast is held once, not twice. Reading loads the file once and
 * keeps it, with a parallel array of start times, so a lookup during a pause touches no disk.
 */

import { createWriteStream, readFileSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { once } from 'node:events'
import { dirname, join } from 'node:path'
import type { WriteStream } from 'node:fs'

import { fail } from '#errors'
import { readConfig } from '#config'

import type { Segment, TranscriptDoc } from './schema.ts'
import { TranscriptDocSchema } from './schema.ts'

export interface TranscriptMeta {
  provider: TranscriptDoc['provider']
  language: string
  generated: boolean
  duration: number
}

export interface LoadedTranscript {
  doc: TranscriptDoc
  /** Segment start times, ascending, for the binary search. */
  starts: number[]
}

const homes = new Map<string, string>()
const loaded = new Map<string, LoadedTranscript>()

function transcriptPath(home: string, sessionId: string): string {
  return join(home, 'sessions', sessionId, 'transcript.json')
}

/** Where the session that was just written lives, so a later read needs no home passed in. */
function pathFor(sessionId: string): string {
  const home = homes.get(sessionId) ?? readConfig().home
  return transcriptPath(home, sessionId)
}

async function put(stream: WriteStream, chunk: string): Promise<void> {
  if (!stream.write(chunk)) await once(stream, 'drain')
}

/** Writes the transcript, segment by segment, and returns how many landed. */
export async function writeTranscript(
  home: string,
  sessionId: string,
  meta: TranscriptMeta,
  segments: Iterable<Segment> | AsyncIterable<Segment>,
): Promise<number> {
  const target = transcriptPath(home, sessionId)
  const temp = `${target}.writing`
  await mkdir(dirname(target), { recursive: true })

  const stream = createWriteStream(temp, { encoding: 'utf8' })
  let count = 0
  try {
    await put(stream, '{"segments":[')
    for await (const segment of segments) {
      await put(stream, `${count === 0 ? '' : ','}\n${JSON.stringify({ ...segment, i: count })}`)
      count += 1
    }
    const tail = { ...meta, segmentCount: count }
    await put(stream, `\n],${JSON.stringify(tail).slice(1)}\n`)
    stream.end()
    await once(stream, 'finish')
  } catch (error) {
    stream.destroy()
    await rm(temp, { force: true })
    fail(
      'STORE_UNWRITABLE',
      `The transcript could not be written to ${target}: ${(error as Error).message}`,
      'Check that OBSERVER_HOME is writable, then run the transcript again.',
    )
  }

  await rename(temp, target)
  homes.set(sessionId, home)
  loaded.delete(sessionId)
  return count
}

/** Loads once and keeps it. `read` and `at` never touch the disk again for this session. */
export function loadTranscript(sessionId: string): LoadedTranscript {
  const cached = loaded.get(sessionId)
  if (cached) return cached

  const path = pathFor(sessionId)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return fail(
      'UNKNOWN_SESSION',
      `No transcript for session ${sessionId}.`,
      'Call open on this session first, or pass a session id that has finished transcribing.',
    )
  }

  const parsed = TranscriptDocSchema.safeParse(JSON.parse(raw))
  if (!parsed.success) {
    return fail(
      'UNKNOWN_SESSION',
      `The transcript for session ${sessionId} is not readable.`,
      'Delete it and run the transcript again.',
    )
  }

  const entry: LoadedTranscript = {
    doc: parsed.data,
    starts: parsed.data.segments.map((segment) => segment.start),
  }
  loaded.set(sessionId, entry)
  return entry
}

/** Last index whose start is at or before `time`, or 0 when the time is before the first. */
export function indexAt(starts: number[], time: number): number {
  let low = 0
  let high = starts.length - 1
  let found = 0
  while (low <= high) {
    const middle = (low + high) >> 1
    if ((starts[middle] ?? 0) <= time) {
      found = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}
