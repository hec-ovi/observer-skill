import { describe, expect, it, vi } from 'vitest'

describe('env', () => {
  it('imports the worker module under a stubbed scope', async () => {
    const posted: unknown[] = []
    let listener: ((event: { data: unknown }) => void) | null = null
    vi.stubGlobal('self', {
      postMessage: (message: unknown) => posted.push(message),
      addEventListener: (_type: string, fn: (event: { data: unknown }) => void) => {
        listener = fn
      },
      close: () => {},
    })
    vi.resetModules()
    await import('../src/pocket/worker.ts')
    expect(typeof listener).toBe('function')
    expect(posted).toEqual([])
  })

  it('constructs a host against a fake Worker', async () => {
    const seen: string[] = []
    class FakeWorker extends EventTarget {
      constructor(url: string | URL) {
        super()
        seen.push(String(url))
      }
      postMessage(): void {}
      terminate(): void {}
    }
    vi.stubGlobal('Worker', FakeWorker)
    const { PocketHost } = await import('../src/pocket/host.ts')
    const { AudioHub } = await import('../src/audio.ts')
    const host = new PocketHost(new AudioHub())
    expect(seen).toEqual(['nope'])
    host.dispose()
  })
})
