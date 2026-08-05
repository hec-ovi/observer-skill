/**
 * What the tests share. It sits outside `test/` because the node runner treats every file
 * under a directory called `test` as a test file.
 */

import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ObserverError } from '#errors'
import { isObserverError } from '#errors'
import type { Source } from '#ingest'

import type { Progress } from './src/schema.ts'

export const FIXTURES = join(import.meta.dirname, 'test', 'fixtures')
export const FAKE_YTDLP = join(FIXTURES, 'bin', 'fake-yt-dlp')
export const FAKE_FFMPEG = join(FIXTURES, 'bin', 'fake-ffmpeg')

export function fixture(name: string): string {
  return join(FIXTURES, name)
}

export function source(overrides: Partial<Source> = {}): Source {
  return {
    provider: 'youtube',
    videoId: 'L9NRuLoAQBg',
    url: 'https://www.youtube.com/watch?v=L9NRuLoAQBg',
    title: 'How blood works',
    channel: 'Fixture Channel',
    duration: 210,
    publishedAt: '2026-01-14',
    hasCaptions: true,
    captionLanguages: ['en'],
    hasAds: false,
    embeddable: true,
    degraded: false,
    ...overrides,
  }
}

export interface Harness {
  home: string
  sessionId: string
  progress: Progress[]
  onProgress: (progress: Progress) => void
}

export interface Pool {
  /** A throwaway home and a session id of its own, so no test reads another's transcript. */
  open: (sessionId: string) => Promise<Harness>
  done: () => Promise<void>
}

/** Every home one suite opened, with the environment put back the way it was found. */
export function pool(): Pool {
  const opened: string[] = []
  const previous = process.env['OBSERVER_HOME']

  return {
    open: async (sessionId) => {
      const home = await mkdtemp(join(tmpdir(), 'observer-home-'))
      opened.push(home)
      process.env['OBSERVER_HOME'] = home
      const progress: Progress[] = []
      return { home, sessionId, progress, onProgress: (entry) => progress.push(entry) }
    },
    done: async () => {
      if (previous === undefined) delete process.env['OBSERVER_HOME']
      else process.env['OBSERVER_HOME'] = previous
      for (const home of opened) await rm(home, { recursive: true, force: true })
    },
  }
}

interface RecordedCall {
  url: string
  status: number
  body: unknown
}

/**
 * Answers from a recording under `test/fixtures/innertube/`, matched on the path, with an
 * override for one url. The player script is answered with a stub: it is fetched for a
 * signature timestamp a replay never uses, and recording it would add megabytes.
 */
export function replayInnertube(
  name: string,
  over: (url: string) => Response | null = () => null,
): () => void {
  const calls = JSON.parse(
    readFileSync(join(FIXTURES, 'innertube', `${name}.json`), 'utf8'),
  ) as RecordedCall[]

  return stubFetch((url) => {
    const overridden = over(url)
    if (overridden) return Promise.resolve(overridden)
    if (url.includes('base.js')) return Promise.resolve(new Response('var stub=1;', { status: 200 }))

    const path = new URL(url).pathname
    const call = calls.find((candidate) => new URL(candidate.url).pathname === path)
    if (!call) return Promise.resolve(new Response('{}', { status: 404 }))
    const body = typeof call.body === 'string' ? call.body : JSON.stringify(call.body)
    return Promise.resolve(
      new Response(body, { status: call.status, headers: { 'content-type': 'application/json' } }),
    )
  })
}

/** Replaces `globalThis.fetch` for the duration of one test. */
export function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): () => void {
  const original = globalThis.fetch
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return handler(url, init)
  }) as typeof globalThis.fetch
  return () => {
    globalThis.fetch = original
  }
}

/** The error a call was supposed to throw, so a test can read its code and its hint. */
export async function caught(run: () => unknown): Promise<ObserverError> {
  try {
    await run()
  } catch (error) {
    if (isObserverError(error)) return error
    throw error
  }
  throw new Error('the call was expected to fail and did not')
}

/** Every word of the transcript, in order, for the duplication checks. */
export function words(texts: string[]): string[] {
  return texts
    .join(' ')
    .split(/\s+/)
    .map((word) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0)
}
