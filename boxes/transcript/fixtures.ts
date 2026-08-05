/**
 * What the tests share. It sits outside `test/` because the node runner treats every file
 * under a directory called `test` as a test file.
 */

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
  done: () => Promise<void>
}

/** A throwaway OBSERVER_HOME, restored when the test ends. */
export async function harness(sessionId = 'sess-test'): Promise<Harness> {
  const home = await mkdtemp(join(tmpdir(), 'observer-home-'))
  const previous = process.env['OBSERVER_HOME']
  process.env['OBSERVER_HOME'] = home
  const progress: Progress[] = []
  return {
    home,
    sessionId,
    progress,
    onProgress: (entry) => progress.push(entry),
    done: async () => {
      if (previous === undefined) delete process.env['OBSERVER_HOME']
      else process.env['OBSERVER_HOME'] = previous
      await rm(home, { recursive: true, force: true })
    },
  }
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
export async function caught(run: () => Promise<unknown>): Promise<ObserverError> {
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
