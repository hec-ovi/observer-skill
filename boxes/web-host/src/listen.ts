import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { Express } from 'express'
import { fail } from '#errors'

export interface Listening {
  server: Server
  port: number
}

/** How many ports above the first one to try before giving up. */
const ATTEMPTS = 20

function bind(app: Express, port: number, host: string): Promise<Server> {
  return new Promise((listening, failed) => {
    const server = createServer(app)
    const onError = (error: Error): void => failed(error)
    server.once('error', onError)
    server.listen(port, host, () => {
      server.off('error', onError)
      // Persistent, so a socket error after the bind is never an uncaught exception.
      server.on('error', (error) => console.error('[observer] http error', error))
      listening(server)
    })
  })
}

/**
 * Listen on the first free port from `port` up. Port 0 asks the kernel for one and is taken
 * as given. A taken range is reported by name, never as a stack trace.
 */
export async function listen(app: Express, port: number, host: string): Promise<Listening> {
  const last = port === 0 ? 0 : port + ATTEMPTS - 1
  for (let candidate = port; candidate <= last; candidate++) {
    try {
      const server = await bind(app, candidate, host)
      const address = server.address()
      return { server, port: typeof address === 'object' && address !== null ? address.port : candidate }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'EADDRINUSE' && candidate < last) {
        console.error(`[observer] port ${candidate} is in use, trying ${candidate + 1}`)
        continue
      }
      if (code === 'EADDRINUSE') break
      if (code === 'EACCES') {
        fail(
          'PROVIDER_UNAVAILABLE',
          `Not allowed to listen on ${host}:${candidate}.`,
          'Choose a port above 1024, or an address this user may bind.',
        )
      }
      throw error
    }
  }
  fail(
    'PROVIDER_UNAVAILABLE',
    `Ports ${port} to ${last} on ${host} are all in use.`,
    'Free one of them, or start the host on a different port.',
  )
}
