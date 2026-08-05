/**
 * The Pocket worker boundary, faked from both sides, so the protocol can be driven message by
 * message without a byte of model downloading.
 *
 * `FakePocketWorker` is what the page talks to. jsdom has no `Worker` and no secure context,
 * which is exactly what the provider refuses to run without, so `installPocketWorker()` puts
 * both in place. `fakeWorkerScope()` is the other side: the `self` the worker module registers
 * itself on.
 */

import { vi } from 'vitest'
import type { EngineMessage, EngineRequest } from '../src/pocket/protocol.ts'

/* --------------------------------------------------------------------------- the page side */

export class FakePocketWorker extends EventTarget {
  static instances: FakePocketWorker[] = []

  readonly url: string
  readonly posted: EngineRequest[] = []
  terminated = false

  constructor(url: string | URL) {
    super()
    this.url = String(url)
    FakePocketWorker.instances.push(this)
  }

  postMessage(request: EngineRequest): void {
    this.posted.push(request)
  }

  terminate(): void {
    this.terminated = true
  }

  /** test-side: the engine answered. */
  emit(message: EngineMessage): void {
    this.dispatchEvent(new MessageEvent('message', { data: message }))
  }

  static last(): FakePocketWorker {
    const found = FakePocketWorker.instances.at(-1)
    if (!found) throw new Error('No FakePocketWorker was constructed')
    return found
  }
}

/** The fake worker and the two page flags `probePocket` insists on. Call it per test. */
export function installPocketWorker(): void {
  FakePocketWorker.instances = []
  vi.stubGlobal('Worker', FakePocketWorker)
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('crossOriginIsolated', false)
}

/* ------------------------------------------------------------------------- the worker side */

export interface WorkerScope {
  /** What the worker sent the page. */
  posted: EngineMessage[]
  /** test-side: the page sent the worker a request. */
  deliver: (request: EngineRequest) => void
}

/**
 * Installs `self` for the worker module and hands back both directions. Import the module
 * under test after calling this: it registers its listener at import. `self` stays stubbed
 * for the rest of the file, so everything else a test file needs is imported at the top.
 */
export function fakeWorkerScope(): WorkerScope {
  const posted: EngineMessage[] = []
  const listeners: ((event: MessageEvent<EngineRequest>) => void)[] = []

  vi.stubGlobal('self', {
    postMessage: (message: EngineMessage) => posted.push(message),
    addEventListener: (_type: string, listener: (event: MessageEvent<EngineRequest>) => void) => {
      listeners.push(listener)
    },
    close: () => {},
  })

  return {
    posted,
    deliver: (request) => {
      const listener = listeners.at(-1)
      if (!listener) throw new Error('the worker registered no message listener')
      listener({ data: request } as MessageEvent<EngineRequest>)
    },
  }
}
