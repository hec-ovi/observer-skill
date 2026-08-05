import { describe, expect, it } from 'vitest'

describe('jsdom capabilities', () => {
  it('supports the verifier handshake', async () => {
    expect(typeof requestAnimationFrame).toBe('function')

    const frame = document.createElement('iframe')
    frame.src = '/sandbox/frame'
    document.body.append(frame)
    const contentWindow = frame.contentWindow
    expect(contentWindow).toBeTruthy()

    let transferred: unknown = null
    // eslint-disable-next-line
    ;(contentWindow as unknown as Record<string, unknown>).postMessage = (
      _message: unknown,
      _origin: unknown,
      transfer: unknown[],
    ) => {
      transferred = transfer?.[0] ?? null
    }

    let source: unknown = 'unset'
    const listener = (event: MessageEvent): void => {
      source = event.source
    }
    addEventListener('message', listener)
    dispatchEvent(new MessageEvent('message', { data: { type: 'hello' }, source: contentWindow }))
    removeEventListener('message', listener)
    expect(source).toBe(contentWindow)

    const channel = new MessageChannel()
    ;(contentWindow as unknown as { postMessage(a: unknown, b: unknown, c: unknown[]): void }).postMessage(
      { type: 'init' },
      '*',
      [channel.port2],
    )
    expect(transferred).toBe(channel.port2)

    const got: unknown[] = []
    channel.port1.onmessage = (event) => got.push(event.data)
    channel.port1.start()
    channel.port2.postMessage({ type: 'done' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(got).toEqual([{ type: 'done' }])

    frame.remove()
  })
})
