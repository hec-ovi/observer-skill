/**
 * The verifier, driven through its contract: `verify` in, one result out.
 *
 * The frame itself cannot run in a simulated DOM, so these tests play its part on the port
 * the verifier hands over, which is the whole of the protocol between them.
 */

import { waitFor } from '@testing-library/dom'
import { describe, expect, it } from 'vitest'
import { createVerifier } from '../src/index.ts'
import type { VerifyResult } from '../src/index.ts'
import type { SandboxInit } from '../src/protocol.ts'

interface Run {
  results: VerifyResult[]
  frame: HTMLIFrameElement
  init: SandboxInit
  /** The frame's end of the channel. */
  port: MessagePort
}

/** Start a verification and complete the handshake the way the frame's script does. */
function start(timeoutMs?: number): Run {
  const results: VerifyResult[] = []
  createVerifier({ onResult: (result) => results.push(result) }).verify({
    requestId: 'r1',
    url: '/api/artifact/s1/a1.js',
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  })

  const frame = document.querySelector('iframe')
  if (!frame?.contentWindow) throw new Error('the verifier mounted no frame')

  let init: SandboxInit | null = null
  let port: MessagePort | null = null
  Object.defineProperty(frame.contentWindow, 'postMessage', {
    configurable: true,
    value: (message: SandboxInit, _origin: string, transfer: MessagePort[]) => {
      init = message
      port = transfer[0] ?? null
    },
  })

  dispatchEvent(new MessageEvent('message', { data: { type: 'hello' }, source: frame.contentWindow }))
  if (!init || !port) throw new Error('the verifier did not open a port')
  ;(port as MessagePort).start()

  return { results, frame, init, port }
}

describe('createVerifier', () => {
  it('reports what a failing module threw, and takes the frame away', async () => {
    const run = start()
    run.port.postMessage({ type: 'error', message: 'TypeError: rows.map is not a function' })
    run.port.postMessage({ type: 'done' })

    await waitFor(() => expect(run.results).toHaveLength(1))
    expect(run.results[0]).toMatchObject({
      requestId: 'r1',
      ok: false,
      errors: ['TypeError: rows.map is not a function'],
    })
    expect(run.frame.isConnected).toBe(false)
  })

  it('reports a module that never finishes mounting instead of hanging', async () => {
    const run = start(20)

    await waitFor(() => expect(run.results).toHaveLength(1))
    const result = run.results[0]
    expect(result?.ok).toBe(false)
    expect(result?.errors[0]).toContain('ARTIFACT_TIMEOUT')
    expect(run.frame.isConnected).toBe(false)
  })

  it('reports a picture and the size it was drawn at', async () => {
    const run = start()
    expect(run.frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(run.init.url).toBe('http://127.0.0.1:4830/api/artifact/s1/a1.js')

    run.port.postMessage({ type: 'mounted', width: 960, height: 540 })
    run.port.postMessage({ type: 'snapshot', png: 'data:image/png;base64,iVBORw0KGgo=' })
    run.port.postMessage({ type: 'done' })

    await waitFor(() => expect(run.results).toHaveLength(1))
    expect(run.results[0]).toEqual({
      requestId: 'r1',
      ok: true,
      errors: [],
      size: { width: 960, height: 540 },
      snapshot: 'data:image/png;base64,iVBORw0KGgo=',
    })
  })
})
