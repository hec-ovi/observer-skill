/**
 * Replays recorded lookups. Every fixture under `fixtures/` was captured from the live
 * endpoints by `scripts/capture-fixtures.ts` and trimmed to the branches this box reads.
 *
 * Two are derived rather than captured, because the condition cannot be recorded on demand:
 * `innertube-refused.json` is a bot challenge, which arrives on YouTube's schedule, and
 * `innertube-not-embeddable.json` is the normal recording with `playableInEmbed` flipped,
 * because a video the owner blocked is refused at the embed check and never reaches the
 * player at all. Everything else is verbatim. Nothing here reaches the network.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(import.meta.dirname, 'fixtures')

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

interface OEmbedFixture {
  status: number
  body: string
}

interface InnertubeCall {
  url: string
  body: unknown
}

export interface Plan {
  /** File name under `fixtures/`, or a status to answer the embed check with. */
  oembed: string | number
  /** File name under `fixtures/`. Omitted means the richer lookup cannot be reached. */
  innertube?: string
  /** Called with every request the box makes, before the recording answers it. */
  watch?: (url: string, init?: FetchInit) => void
}

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, name), 'utf8')) as T
}

function urlOf(input: FetchInput): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/** Installs the stub and returns the restore function the test must defer. */
export function replay(plan: Plan): () => void {
  const original = globalThis.fetch

  const embed =
    typeof plan.oembed === 'number'
      ? { status: plan.oembed, body: '' }
      : load<OEmbedFixture>(plan.oembed)
  const calls = plan.innertube === undefined ? null : load<InnertubeCall[]>(plan.innertube)

  globalThis.fetch = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const url = urlOf(input)
    plan.watch?.(url, init)

    if (url.includes('/oembed')) {
      return new Response(embed.body, { status: embed.status })
    }

    if (calls === null) throw new Error('offline')

    // The player script is fetched for a signature timestamp, and a recording of two and a
    // half megabytes of it would prove nothing. The lookup only needs it to exist.
    if (url.includes('base.js')) return new Response('var stub=1;', { status: 200 })

    const endpoint = new URL(url).pathname
    const call = calls.find((c) => new URL(c.url).pathname === endpoint)
    if (!call) throw new Error(`no recording for ${endpoint}`)
    // The loader script is javascript, not json, and the player id is read out of it.
    if (typeof call.body === 'string') return new Response(call.body, { status: 200 })
    return Response.json(call.body)
  }

  return () => {
    globalThis.fetch = original
  }
}
