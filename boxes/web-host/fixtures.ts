import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { get } from 'node:http'
import type { ClientRequest, IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fail } from '#errors'
import type {
  Artifact,
  InboxEventInput,
  Phase,
  Progress,
  Session,
  SessionDiff,
  SessionPatch,
  Signal,
  SignalInput,
  Subscriber,
} from '#session'
import { signalSchema } from '#session'
import { createHost } from './src/index.ts'
import type { Host, HostOptions, SessionPort } from './src/index.ts'

/**
 * What the tests drive the real server with. It lives outside `test/` because the runner
 * treats every file under that directory as a test file.
 */

export function makeSession(overrides: Partial<Session> = {}): Session {
  const now = new Date().toISOString()
  return {
    id: 's1',
    createdAt: now,
    updatedAt: now,
    source: {
      provider: 'youtube',
      videoId: 'abc123',
      url: 'https://www.youtube.com/watch?v=abc123',
      title: 'A video',
      channel: 'A channel',
      duration: 600,
      publishedAt: '2026-01-15',
      hasCaptions: true,
      captionLanguages: ['en'],
      hasAds: false,
      embeddable: true,
      degraded: false,
    },
    settings: {
      theme: 'system',
      language: 'en',
      extraKnowledge: true,
      toolkit: true,
      voiceOut: { provider: 'web-speech', voice: null },
      voiceIn: { provider: 'web-speech', endpoint: null },
    },
    userPrompt: null,
    phase: 'live',
    progress: { step: '', done: 0, total: 0, message: '' },
    error: null,
    transcript: null,
    concepts: [],
    artifacts: [],
    position: { time: 0, state: 'idle' },
    agent: { attached: false, lastSeen: null },
    log: [],
    cursor: 0,
    ...overrides,
  }
}

export function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'a1',
    title: 'A chart',
    kind: 'chart',
    conceptId: null,
    startsAt: null,
    endsAt: null,
    status: 'built',
    bundlePath: 'sessions/s1/artifacts/a1.js',
    snapshotPath: null,
    error: null,
    ...overrides,
  }
}

/** A store that satisfies the part of the session contract web-host uses, and records calls. */
export class FakeStore implements SessionPort {
  readonly sessions = new Map<string, Session>()
  readonly inbox: InboxEventInput[] = []
  readonly signals: Signal[] = []
  readonly patches: SessionPatch[] = []
  unsubscribed = 0
  readonly #listeners = new Map<string, Set<Subscriber>>()

  constructor(sessions: Session[] = [makeSession()]) {
    for (const session of sessions) this.sessions.set(session.id, session)
  }

  get(id: string): Session {
    const session = this.sessions.get(id)
    if (session === undefined) {
      fail('UNKNOWN_SESSION', `No session ${id}.`, 'Open a session first.')
    }
    return session
  }

  async patch(id: string, patch: SessionPatch): Promise<Session> {
    const session = this.get(id)
    this.patches.push(patch)
    this.#emit(id, { type: 'patch', patch: patch as SessionDiff })
    return session
  }

  subscribe(id: string, listener: Subscriber): () => void {
    const listeners = this.#listeners.get(id) ?? new Set<Subscriber>()
    listeners.add(listener)
    this.#listeners.set(id, listeners)
    return () => {
      this.unsubscribed += 1
      listeners.delete(listener)
    }
  }

  signal(id: string, signal: SignalInput): void {
    const parsed = signalSchema.parse(signal)
    this.signals.push(parsed)
    this.#emit(id, { type: 'signal', signal: parsed })
  }

  async push(id: string, event: InboxEventInput): Promise<number> {
    this.get(id)
    this.inbox.push(event)
    return this.inbox.length
  }

  /** The one subscriber message a patch cannot carry: the store sends it when a phase moves. */
  movePhase(id: string, phase: Phase, progress: Progress): void {
    this.#emit(id, { type: 'phase', phase, progress })
  }

  #emit(id: string, message: Parameters<Subscriber>[0]): void {
    for (const listener of this.#listeners.get(id) ?? []) listener(message)
  }
}

/** A directory shaped like a Vite build: the page, the verify frame, and the registry. */
export async function makeAppDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'observer-app-'))
  await mkdir(join(dir, 'assets'))
  await mkdir(join(dir, 'sandbox', 'vendor'), { recursive: true })
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>observer</title><div id="app"></div>')
  // Shaped like the real frame: an inline import map plus the module that uses it.
  await writeFile(
    join(dir, 'sandbox.html'),
    '<!doctype html><title>verify</title>' +
      '<script type="importmap">{"imports":{"echarts":"/sandbox/vendor/echarts.js"}}</script>' +
      '<script type="module" src="/assets/sandbox-abc123.js"></script>',
  )
  await writeFile(join(dir, 'assets', 'app-abc123.js'), 'export const app = 1\n')
  await writeFile(join(dir, 'sandbox', 'vendor', 'echarts.js'), 'export const echarts = 1\n')
  return dir
}

/** A home directory with one session folder holding one bundle. */
export async function makeHome(sessionId = 's1', bundle = 'export const chart = 1\n'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'observer-home-'))
  await mkdir(join(dir, 'sessions', sessionId, 'artifacts'), { recursive: true })
  await writeFile(join(dir, 'sessions', sessionId, 'artifacts', 'a1.js'), bundle)
  return dir
}

export interface Running {
  host: Host
  store: FakeStore
  base: string
  appDir: string
  home: string
  stop: () => Promise<void>
}

/** The real server, on an ephemeral port, started. */
export async function startHost(
  options: Partial<HostOptions> & { store?: FakeStore } = {},
): Promise<Running> {
  const store = options.store ?? new FakeStore()
  const appDir = options.appDir ?? (await makeAppDir())
  const home = options.home ?? (await makeHome())
  const host = await createHost({ ...options, store, appDir, home, port: 0 })
  const { url } = await host.start()
  return { host, store, base: url, appDir, home, stop: () => host.close() }
}

export interface SseEvent {
  id: string | null
  event: string
  data: unknown
}

/** One open event stream, with the frames it has received so far. */
export class SseClient {
  readonly events: SseEvent[] = []
  readonly headers: IncomingHttpHeaders
  readonly #request: ClientRequest
  readonly #waiters = new Set<{ event: string; hit: (e: SseEvent) => void }>()
  #buffer = ''

  constructor(request: ClientRequest, response: IncomingMessage) {
    this.#request = request
    this.headers = response.headers
    response.setEncoding('utf8')
    response.on('data', (chunk: string) => this.#read(chunk))
  }

  waitFor(event: string, timeoutMs = 2_000): Promise<SseEvent> {
    const seen = this.events.find((candidate) => candidate.event === event)
    if (seen !== undefined) return Promise.resolve(seen)
    const { promise, resolve, reject } = Promise.withResolvers<SseEvent>()
    const waiter = { event, hit: resolve }
    this.#waiters.add(waiter)
    const timer = setTimeout(() => {
      this.#waiters.delete(waiter)
      reject(new Error(`no "${event}" event within ${timeoutMs} ms`))
    }, timeoutMs)
    return promise.finally(() => clearTimeout(timer))
  }

  /** Vanish, the way a closed laptop does: no close frame, just a dead socket. */
  vanish(): void {
    this.#request.destroy()
  }

  #read(chunk: string): void {
    this.#buffer += chunk
    let split = this.#buffer.indexOf('\n\n')
    while (split !== -1) {
      this.#take(this.#buffer.slice(0, split))
      this.#buffer = this.#buffer.slice(split + 2)
      split = this.#buffer.indexOf('\n\n')
    }
  }

  #take(block: string): void {
    let id: string | null = null
    let event: string | null = null
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith('id: ')) id = line.slice(4)
      else if (line.startsWith('event: ')) event = line.slice(7)
      else if (line.startsWith('data: ')) data.push(line.slice(6))
    }
    if (event === null) return
    const frame: SseEvent = {
      id,
      event,
      data: data.length === 0 ? null : JSON.parse(data.join('\n')),
    }
    this.events.push(frame)
    for (const waiter of [...this.#waiters]) {
      if (waiter.event !== event) continue
      this.#waiters.delete(waiter)
      waiter.hit(frame)
    }
  }
}

export function openSse(url: string): Promise<SseClient> {
  return new Promise((opened, failed) => {
    const request = get(url, { headers: { accept: 'text/event-stream' } }, (response) => {
      opened(new SseClient(request, response))
    })
    request.on('error', failed)
  })
}

/** Wait for something the server does on its own, without pinning it to a fixed delay. */
export async function waitUntil(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition never held')
    await new Promise((tick) => setTimeout(tick, 5))
  }
}

export async function postJson(url: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}
