import { describe, expect, it, vi } from 'vitest'

describe('env', () => {
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
