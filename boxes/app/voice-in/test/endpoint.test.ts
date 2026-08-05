/**
 * The endpoint provider: what it posts, what it does with an answer, and what a hold that
 * never reached the gate costs the server (nothing).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flush, hear, recordedListener } from './support.ts'

const BASE_URL = 'http://127.0.0.1:8080'

function answering(response: Partial<Response> & { json?: () => Promise<unknown> }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response as Response),
  )
}

function calls(): [string, RequestInit][] {
  return vi.mocked(fetch).mock.calls as unknown as [string, RequestInit][]
}

describe('the endpoint provider', () => {
  beforeEach(() => {
    answering({ ok: true, status: 200, json: async () => ({ text: '  what is a matrix  ' }) })
  })

  it('posts the recording and delivers the text', async () => {
    const { listener, heard } = recordedListener({
      provider: 'endpoint',
      baseUrl: BASE_URL,
      apiKey: 'local-key',
    })
    expect(listener.engine).toBe('endpoint')

    await listener.start()
    hear(1.5, 0.4)
    await listener.stop()

    expect(heard).toEqual(['what is a matrix'])

    const [url, init] = calls()[0] ?? []
    expect(url).toBe(`${BASE_URL}/v1/audio/transcriptions`)
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ Authorization: 'Bearer local-key' })

    const body = init?.body as FormData
    expect(body.get('model')).toBe('whisper-1')
    expect(body.get('response_format')).toBe('json')
    expect(body.get('language')).toBe('en')
    expect((body.get('file') as File).type).toBe('audio/wav')
  })

  it('delivers an empty utterance when the endpoint fails', async () => {
    answering({ ok: false, status: 503 })
    const { listener, heard } = recordedListener({ provider: 'endpoint', baseUrl: BASE_URL })

    await listener.start()
    hear(1, 0.4)
    await listener.stop()

    expect(heard).toEqual([''])
    expect(listener.reason).toBe('transcription 503')
    expect(listener.state).toBe('idle')
  })

  it('aborts a request still in flight when the listener is disposed', async () => {
    // A request that only ends when its signal says so, which is what a real one does.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'))
            })
          }),
      ),
    )

    const { listener, heard, states } = recordedListener({
      provider: 'endpoint',
      baseUrl: BASE_URL,
    })

    await listener.start()
    hear(1, 0.4)
    const stopped = listener.stop()
    await flush()
    expect(listener.state).toBe('working')

    listener.dispose()
    expect(calls()[0]?.[1]?.signal?.aborted).toBe(true)

    await stopped
    expect(heard).toEqual([])
    expect(states).toEqual(['listening', 'working'])
  })

  it('sends nothing for a hold the gate dropped', async () => {
    const { listener, heard } = recordedListener({ provider: 'endpoint', baseUrl: BASE_URL })

    await listener.start()
    hear(0.2, 0.9)
    await listener.stop()

    expect(heard).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
