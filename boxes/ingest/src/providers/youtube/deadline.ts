/**
 * A deadline the socket can feel. The client builds its own requests and carries no signal
 * of its own, so the deadline rides the async context down to the fetch the client was
 * created with: one signal both tears the request down and bounds the wait.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

type FetchInput = Parameters<typeof fetch>[0]
type FetchInit = Parameters<typeof fetch>[1]

const current = new AsyncLocalStorage<AbortSignal>()

/** The fetch the client is built with. Outside a deadline it is the plain one. */
export function fetchWithin(input: FetchInput, init?: FetchInit): Promise<Response> {
  const signal = current.getStore()
  return globalThis.fetch(input, signal === undefined ? init : { ...init, signal })
}

/** Runs `work` under a deadline: its requests abort at `ms`, and so does the answer. */
export function withDeadline<T>(ms: number, work: () => Promise<T>): Promise<T> {
  const signal = AbortSignal.timeout(ms)
  const expired = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(new Error(`Lookup did not answer within ${ms} ms.`))
    })
  })
  return Promise.race([current.run(signal, work), expired])
}
