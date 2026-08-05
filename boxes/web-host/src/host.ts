import type { Server } from 'node:http'
import type { Express } from 'express'
import { fail } from '#errors'
import { buildApp } from './app.ts'
import type { HostContext } from './context.ts'
import { listen } from './listen.ts'
import { LiveHub } from './live-hub.ts'
import type { VerifyResult } from './schema.ts'
import type { CreateSession, ReadTranscript, SessionPort } from './session-port.ts'
import { Verifications } from './verifications.ts'

const DEFAULT_PORT = 4830
const DEFAULT_BIND = '127.0.0.1'
const DEFAULT_HEARTBEAT_MS = 15_000
const DEFAULT_VERIFY_TIMEOUT_MS = 8_000
/** How long a request in flight has, once the streams have been ended. */
const CLOSE_GRACE_MS = 200

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])

export interface HostOptions {
  store: SessionPort
  /** The built app: `index.html`, `assets/`, and `sandbox/runner.js`. */
  appDir: string
  /** Where sessions live. Bundles and snapshots resolve inside the session's own folder. */
  home: string
  /** First port to try. A taken port moves up one at a time. `0` asks the kernel. */
  port?: number
  /** Loopback unless the caller asks for more; a wider bind is logged when it happens. */
  bind?: string
  /** Reported by `/healthz`. */
  version?: string
  /** Interval between `ping` events on an open stream. */
  heartbeatMs?: number
  createSession?: CreateSession
  readTranscript?: ReadTranscript
}

export interface VerifyRequest {
  sessionId: string
  artifactId: string
  timeoutMs?: number
}

export interface Host {
  /** `null` until the listener starts. */
  readonly url: string | null
  readonly port: number | null
  /** Listen, or return where it is already listening. Called when a session first exists. */
  start(): Promise<{ url: string; port: number }>
  /** Run one artifact in the open page's sandbox and wait for what it reports. */
  verify(request: VerifyRequest): Promise<VerifyResult>
  close(): Promise<void>
}

class WebHost implements Host {
  readonly #app: Express
  readonly #store: SessionPort
  readonly #hub: LiveHub
  readonly #verifications = new Verifications()
  readonly #bind: string
  readonly #firstPort: number
  #server: Server | null = null
  #port: number | null = null
  #starting: Promise<{ url: string; port: number }> | null = null

  constructor(options: HostOptions) {
    this.#store = options.store
    this.#bind = options.bind ?? DEFAULT_BIND
    this.#firstPort = options.port ?? DEFAULT_PORT
    this.#hub = new LiveHub(options.store, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS)

    const context: HostContext = {
      store: options.store,
      home: options.home,
      appDir: options.appDir,
      version: options.version ?? '0.0.0',
      hub: this.#hub,
      verifications: this.#verifications,
      createSession: options.createSession ?? null,
      readTranscript: options.readTranscript ?? null,
      origin: () => this.#origin(),
    }
    this.#app = buildApp(context)
  }

  get port(): number | null {
    return this.#port
  }

  get url(): string | null {
    return this.#port === null ? null : this.#origin()
  }

  start(): Promise<{ url: string; port: number }> {
    if (this.#port !== null) return Promise.resolve({ url: this.#origin(), port: this.#port })
    this.#starting ??= this.#listen().finally(() => {
      this.#starting = null
    })
    return this.#starting
  }

  async verify(request: VerifyRequest): Promise<VerifyResult> {
    const { sessionId, artifactId } = request
    if (!this.#hub.hasPage(sessionId)) {
      fail(
        'PAGE_NOT_OPEN',
        `No page is listening to session ${sessionId}.`,
        'Open the session page, then verify again.',
      )
    }
    const timeoutMs = request.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS
    const { requestId, result } = this.#verifications.start(artifactId, timeoutMs)
    // The module, not a document: the page owns the frame it runs the module in.
    const url = `${this.#origin()}/api/artifact/${encodeURIComponent(sessionId)}/${encodeURIComponent(artifactId)}`
    this.#store.signal(sessionId, { type: 'verify', requestId, url, timeoutMs })
    return result
  }

  async close(): Promise<void> {
    this.#verifications.closeAll()
    this.#hub.closeAll()

    const server = this.#server
    this.#server = null
    this.#port = null
    if (server === null) return

    await new Promise<void>((closed) => {
      // Ended streams leave keep-alive sockets behind, and those hold `close()` open until
      // they time out. The backstop reaps them.
      const force = setTimeout(() => server.closeAllConnections(), CLOSE_GRACE_MS)
      force.unref()
      server.close(() => {
        clearTimeout(force)
        closed()
      })
    })
  }

  async #listen(): Promise<{ url: string; port: number }> {
    const { server, port } = await listen(this.#app, this.#firstPort, this.#bind)
    this.#server = server
    this.#port = port
    const url = this.#origin()
    if (!LOOPBACK.has(this.#bind)) {
      console.error(`[observer] serving on ${url}, reachable from the network`)
    }
    return { url, port }
  }

  #origin(): string {
    const host = this.#bind === '0.0.0.0' || this.#bind === '::' ? '127.0.0.1' : this.#bind
    const shown = host.includes(':') ? `[${host}]` : host
    return `http://${shown}:${this.#port ?? this.#firstPort}`
  }
}

/**
 * Build the host. Nothing listens yet: `start()` does that, and a session that never opens a
 * page costs nothing.
 */
export async function createHost(options: HostOptions): Promise<Host> {
  return new WebHost(options)
}
