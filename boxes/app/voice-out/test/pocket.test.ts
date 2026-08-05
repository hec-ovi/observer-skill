/**
 * The Pocket provider from the page's side, with the worker faked at its boundary: what
 * `warm` reports when the download fails, and who hears the download while it is happening.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioHub } from '../src/audio.ts'
import { VoiceOutError, dispose, warm } from '../src/index.ts'
import type { VoiceOutConfig, WarmProgress } from '../src/index.ts'
import { PocketHost } from '../src/pocket/host.ts'
import type { PocketOptions } from '../src/pocket/host.ts'
import { FakePocketWorker, installPocketWorker } from './worker-boundary.ts'

const config: VoiceOutConfig = { provider: 'pocket', voice: 'alba' }

const OPTIONS: PocketOptions = {
  baseUrl: 'https://voices.example/',
  bundle: 'english_2026-04',
  voice: 'alba',
  ortBaseUrl: 'https://ort.example/',
}

beforeEach(() => {
  installPocketWorker()
})

afterEach(() => {
  dispose()
})

describe('pocket', () => {
  it('reports a download that failed as VOICE_UNAVAILABLE', async () => {
    const failure = warm(config).catch((error: unknown) => error)
    await vi.waitFor(() => expect(FakePocketWorker.last().posted).toHaveLength(1))
    expect(FakePocketWorker.last().posted[0]?.type).toBe('load')

    FakePocketWorker.last().emit({ type: 'failed', line: null, reason: 'the CDN answered 503' })

    const error = await failure
    expect(error).toBeInstanceOf(VoiceOutError)
    expect((error as VoiceOutError).code).toBe('VOICE_UNAVAILABLE')
    expect((error as VoiceOutError).message).toContain('the CDN answered 503')
  })

  // Driven at the host rather than through `speak`, because the second caller is the spoken
  // line, and a load already in flight sends the worker nothing to wait for.
  it('keeps reporting the download to the panel when a line joins it', () => {
    const host = new PocketHost(new AudioHub())
    const steps: WarmProgress[] = []
    try {
      host.load(OPTIONS, (progress) => steps.push(progress))
      host.load(OPTIONS)

      FakePocketWorker.last().emit({ type: 'progress', step: 'model', loaded: 90, total: 195 })
      expect(steps).toEqual([{ step: 'model', loaded: 90, total: 195 }])
    } finally {
      host.dispose()
    }
  })
})
