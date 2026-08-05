/**
 * The worker's side of Pocket: a load that failed can be tried again, and a cache that will
 * not keep the bytes does not cost the user the download.
 *
 * Both are what a wifi blip or a nearly full origin does to a 186 MiB download, and both are
 * invisible from the page: the worker answers with the same `failed` message either way.
 */

import { describe, expect, it, vi } from 'vitest'
import { fetchAsset } from '../src/pocket/cache.ts'
import { PocketEngine } from '../src/pocket/engine.ts'
import type { LoadRequest } from '../src/pocket/protocol.ts'
import { fakeWorkerScope } from './worker-boundary.ts'

const LOAD: LoadRequest = {
  type: 'load',
  baseUrl: 'https://voices.example/',
  bundle: 'english_2026-04',
  voice: 'alba',
  ortBaseUrl: 'https://ort.example/',
}

const ASSET = 'https://voices.example/onnx/english_2026-04/voices.bin'

/** A response that arrives in one chunk through a reader, the way a real download does. */
function streamed(bytes: Uint8Array): Response {
  let sent = false
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined }
          sent = true
          return { done: false, value: bytes }
        },
      }),
    },
  } as unknown as Response
}

describe('the worker', () => {
  it('loads again after a load that failed', async () => {
    const scope = fakeWorkerScope()
    const engine = { sampleRate: 24000 } as unknown as PocketEngine
    const load = vi
      .spyOn(PocketEngine, 'load')
      .mockRejectedValueOnce(new Error('the wifi dropped'))
      .mockResolvedValueOnce(engine)

    await import('../src/pocket/worker.ts')

    scope.deliver(LOAD)
    await vi.waitFor(() => expect(scope.posted).toHaveLength(1))
    expect(scope.posted[0]).toEqual({ type: 'failed', line: null, reason: 'the wifi dropped' })

    scope.deliver(LOAD)
    await vi.waitFor(() => expect(scope.posted).toHaveLength(2))
    expect(scope.posted[1]).toEqual({ type: 'ready' })
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('the asset cache', () => {
  it('hands back the bytes when the cache refuses to keep them', async () => {
    const put = vi.fn(async () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })
    vi.stubGlobal('caches', { open: async () => ({ match: async () => undefined, put }) })
    const bytes = new Uint8Array([7, 8, 9, 10])
    vi.stubGlobal('fetch', vi.fn(async () => streamed(bytes)))

    const received: number[] = []
    const got = await fetchAsset(ASSET, (count) => received.push(count))

    expect(new Uint8Array(got)).toEqual(bytes)
    expect(received).toEqual([4])
    expect(put).toHaveBeenCalledTimes(1)
  })
})
