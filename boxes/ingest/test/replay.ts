/**
 * Replays recorded lookups. Every fixture under `fixtures/` was captured from the live
 * endpoints on 2026-08-05; the innertube captures keep only the branches this box reads.
 * The one exception is `innertube-refused.json`, a challenge YouTube serves on its own
 * schedule: it carries YouTube's wording in the shape the player endpoint answers with.
 * Nothing here reaches the network.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(import.meta.dirname, 'fixtures')

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

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

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

    const endpoint = new URL(url).pathname
    const call = calls.find((c) => new URL(c.url).pathname === endpoint)
    if (!call) throw new Error(`no recording for ${endpoint}`)
    return Response.json(call.body)
  }

  return () => {
    globalThis.fetch = original
  }
}
