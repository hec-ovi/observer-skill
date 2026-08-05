/**
 * The stdio loop. `serveStdio` owns the transport and the protocol era; this module owns
 * when it ends, which is when the client closes the stream.
 */

import type { Readable } from 'node:stream'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import type { PromptFile } from './prompts.ts'
import { report } from './report.ts'
import type { Runtime } from './runtime.ts'
import { createServer } from './server.ts'

/** Resolves when the stream can carry nothing more, however it ended. */
function whenClosed(stream: Readable): Promise<void> {
  if (stream.readableEnded || stream.destroyed) return Promise.resolve()
  return new Promise((resolve) => {
    const done = (): void => {
      stream.off('end', done)
      stream.off('close', done)
      stream.off('error', done)
      resolve()
    }
    stream.once('end', done)
    stream.once('close', done)
    stream.once('error', done)
  })
}

export async function serveOnStdio(
  runtime: Runtime,
  prompts: readonly PromptFile[],
  stdin: Readable = process.stdin,
): Promise<void> {
  const handle = serveStdio(() => createServer(runtime, prompts), {
    onerror: (error) => report('mcp', error),
  })

  await whenClosed(stdin)
  // Anyone still blocked on an inbox is released before the connection is torn down, so a
  // pending `wait` cannot hold the process open.
  runtime.close()
  await handle.close()
}
