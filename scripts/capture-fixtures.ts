#!/usr/bin/env node
/**
 * Records the live lookups `ingest` and `transcript` make, and writes them where those
 * boxes' tests replay them from.
 *
 * The tests never reach the network, and a hand-written recording of an endpoint this
 * complicated is a recording of what someone assumed. So it is captured, then trimmed to
 * the branches the boxes read; the tests passing against the trimmed copy is the proof that
 * the trimming changed no parsed value.
 *
 * Run it when YouTube changes shape and a fixture stops matching reality:
 *   node scripts/capture-fixtures.ts
 */

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface Call {
  url: string
  status: number
  body: unknown
}

const ROOT = join(import.meta.dirname, '..')
const INGEST = join(ROOT, 'boxes', 'ingest', 'test', 'fixtures')
const TRANSCRIPT = join(ROOT, 'boxes', 'transcript', 'test', 'fixtures', 'innertube')

/** One video per shape the boxes have to handle. */
const VIDEOS = [
  { name: 'normal', id: 'aircAruvnKk' },
  { name: 'short', id: 'jNQXAC9IVRw' },
  { name: 'no-captions', id: 'HZW4cEBWl58' },
  { name: 'not-embeddable', id: 'bquQVe4zLhQ' },
]

/** Branches nothing reads, and the ones that make a recording unreadable by a human. */
const DROP = new Set([
  'streamingData',
  'storyboards',
  'adPlacements',
  'adSlots',
  'adBreakHeartbeatParams',
  'playbackTracking',
  'attestation',
  'messages',
  'endscreen',
  'annotations',
  'cards',
  'frameworkUpdates',
  'responseContext',
])

function trim(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(trim)
  if (value === null || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) {
    if (DROP.has(key)) continue
    out[key] = trim(inner)
  }
  return out
}

/** The watch-next response, reduced to the renderer the publish date lives in. */
function dateOnly(body: unknown): unknown {
  const found: unknown[] = []
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item)
      return
    }
    if (value === null || typeof value !== 'object') return
    const record = value as Record<string, unknown>
    if ('videoPrimaryInfoRenderer' in record) {
      found.push({ videoPrimaryInfoRenderer: record['videoPrimaryInfoRenderer'] })
    }
    for (const inner of Object.values(record)) walk(inner)
  }
  walk(body)
  return {
    contents: { twoColumnWatchNextResults: { results: { results: { contents: found } } } },
  }
}

async function record(id: string): Promise<{ calls: Call[]; note: string }> {
  const calls: Call[] = []
  const real = globalThis.fetch
  globalThis.fetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const answer = await real(input, init)
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const text = await answer.clone().text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // oembed and the caption track are not always json.
    }
    calls.push({ url, status: answer.status, body })
    return answer
  }

  const notes: string[] = []
  try {
    const { resolve } = await import('#ingest')
    const source = await resolve({ url: `https://www.youtube.com/watch?v=${id}` })
    notes.push(`captions=${source.hasCaptions} embeddable=${source.embeddable}`)
    const transcript = await import('#transcript')
    const home = await mkdtemp(join(tmpdir(), 'observer-capture-'))
    try {
      const ref = await transcript.fetch(source, {
        home,
        sessionId: id,
        provider: 'innertube',
        onProgress: () => {},
      })
      notes.push(`${ref.segmentCount} segments in ${ref.language}`)
    } catch (error) {
      notes.push(`no transcript (${(error as Error).message.slice(0, 40)})`)
    }
  } catch (error) {
    notes.push(`refused (${(error as Error).message.slice(0, 40)})`)
  } finally {
    globalThis.fetch = real
  }
  return { calls, note: notes.join(', ') }
}

/** The player script is fetched for a signature timestamp a replay never uses. */
function worthKeeping(call: Call): boolean {
  return !call.url.includes('base.js')
}

function shrink(call: Call): Call {
  const path = new URL(call.url).pathname
  if (path.endsWith('/next')) return { ...call, body: dateOnly(call.body) }
  if (path.endsWith('/player')) return { ...call, body: trim(call.body) }
  return call
}

await mkdir(INGEST, { recursive: true })
await mkdir(TRANSCRIPT, { recursive: true })

for (const video of VIDEOS) {
  const { calls, note } = await record(video.id)
  const kept = calls.filter(worthKeeping).map(shrink)
  const json = `${JSON.stringify(kept, null, 1)}\n`
  await writeFile(join(INGEST, `${video.name}.json`), json)
  await writeFile(join(TRANSCRIPT, `${video.name}.json`), json)
  process.stderr.write(
    `${video.name.padEnd(15)} ${video.id}  ${kept.length} calls  ${Math.round(json.length / 1024)}kb  ${note}\n`,
  )
}
