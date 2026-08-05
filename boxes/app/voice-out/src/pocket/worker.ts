/**
 * The Pocket worker: a message pump and nothing else.
 *
 * Loading happens once, however many times it is asked for. Every line carries an id, and
 * audio is posted back with the id and the buffer transferred, so a line that was cut can be
 * ignored on the other side instead of playing over its replacement.
 */

import { PocketEngine } from './engine.ts'
import type { EngineMessage, EngineRequest, LoadRequest } from './protocol.ts'

/** The box compiles against the DOM lib, where these three have a different shape. */
interface WorkerScope {
  postMessage(message: EngineMessage, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<EngineRequest>) => void): void
  close(): void
}

const scope = self as unknown as WorkerScope

let engine: Promise<PocketEngine> | null = null
let options: LoadRequest | null = null
let stoppedLine: number | null = null

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function load(request: LoadRequest): Promise<PocketEngine> {
  options = request
  engine ??= PocketEngine.load(request, (progress) =>
    scope.postMessage({ type: 'progress', ...progress }),
  )
  return engine
}

async function speak(line: number, text: string, voice: string): Promise<void> {
  const request = options
  if (!request) throw new Error('speak arrived before load')

  const ready = await load(request)
  if (stoppedLine !== line) {
    await ready.speak(
      text,
      voice,
      (pcm) => {
        if (stoppedLine === line) return
        scope.postMessage({ type: 'audio', line, pcm, sampleRate: ready.sampleRate }, [pcm.buffer])
      },
      () => stoppedLine === line,
    )
  }
  scope.postMessage({ type: 'done', line })
}

scope.addEventListener('message', (event) => {
  const request = event.data
  switch (request.type) {
    case 'load':
      load(request).then(
        () => scope.postMessage({ type: 'ready' }),
        (error: unknown) => scope.postMessage({ type: 'failed', line: null, reason: reason(error) }),
      )
      return
    case 'speak':
      speak(request.line, request.text, request.voice).catch((error: unknown) => {
        scope.postMessage({ type: 'failed', line: request.line, reason: reason(error) })
      })
      return
    case 'stop':
      stoppedLine = request.line
      return
    case 'dispose':
      engine = null
      options = null
      scope.close()
      return
  }
})
