/**
 * Shared setup for this box's tests. It sits outside `test/` on purpose: the node test
 * runner treats every file under a `test/` directory as a test file.
 *
 * Every box below is faked at its contract, so these tests need no network, no bundler and
 * no browser. The MCP server itself is real, and so is the client driving it.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import type { BuildError, BuildInput, BuildResult } from '#artifact'
import { fail } from '#errors'
import type { Source } from '#ingest'
import { createKnowledge } from '#knowledge'
import { createStore } from '#session'
import type { Session, SessionStore } from '#session'
import type { ReadOptions, TranscriptPage, TranscriptRef, TranscriptWindow } from '#transcript'
import type { VerifyResult } from '#web-host'
import { agentIoOn } from './src/api.ts'
import type { AgentIo } from './src/api.ts'
import type { AgentIoDeps, ArtifactPort, HostPort, IngestPort, TranscriptPort } from './src/index.ts'
import { loadPrompts } from './src/prompts.ts'
import { Runtime } from './src/runtime.ts'
import { createServer } from './src/server.ts'

export const DURATION = 3600
export const VIDEO_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'

/** A one-pixel PNG, which is all a snapshot has to be for the wire to carry it. */
export const SNAPSHOT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export const SOURCE: Source = {
  provider: 'youtube',
  videoId: 'dQw4w9WgXcQ',
  url: VIDEO_URL,
  title: 'How a Fourier transform works',
  channel: 'Signals',
  duration: DURATION,
  publishedAt: '2024-02-01',
  hasCaptions: true,
  captionLanguages: ['en'],
  hasAds: false,
  embeddable: true,
  degraded: false,
}

// --- the boxes below, at their contracts -----------------------------------

export class FakeIngest implements IngestPort {
  source: Source = SOURCE

  async resolve(input: { url: string; hasAds?: boolean }): Promise<Source> {
    return { ...this.source, url: input.url, hasAds: input.hasAds ?? false }
  }
}

/** Segments every ten seconds for the whole video, which is enough to page. */
function segmentsOf(count: number): { i: number; start: number; end: number; text: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    i,
    start: i * 10,
    end: i * 10 + 10,
    text: `Segment ${i}: ${'the frequency domain is where this becomes obvious. '.repeat(3)}`,
  }))
}

export class FakeTranscript implements TranscriptPort {
  readonly segments = segmentsOf(360)
  /** Set to a code to make the background run fail the way a real provider does. */
  failWith: string | null = null
  /** True once a run has reached the provider, which is when the session is transcribing. */
  started = false
  /** Whether the words were a human's, which is what the tool reports as `generated`. */
  generated = false
  #gate: Promise<void> | null = null
  #open: (() => void) | null = null

  /** Holds the next run inside `fetch`, so a test can act while the words are on their way. */
  hold(): void {
    this.#gate = new Promise((resolve) => {
      this.#open = resolve
    })
  }

  release(): void {
    this.#open?.()
    this.#gate = null
    this.#open = null
  }

  async fetch(): Promise<TranscriptRef> {
    this.started = true
    if (this.#gate !== null) await this.#gate
    if (this.failWith !== null) {
      fail('NO_TRANSCRIPT', this.failWith, 'Point OBSERVER_TRANSCRIPT at a provider.')
    }
    return {
      provider: 'captions',
      language: 'en',
      segmentCount: this.segments.length,
      duration: DURATION,
      generated: this.generated,
    }
  }

  read(_sessionId: string, options: ReadOptions = {}): TranscriptPage {
    const from = options.from ?? 0
    const to = options.to ?? DURATION
    const matching = this.segments.filter(
      (segment) => segment.end >= from && segment.start <= to,
    )
    const offset = options.offset ?? 0
    const limit = options.limit ?? matching.length
    const segments = matching.slice(offset, offset + limit)
    const next = offset + segments.length
    return {
      segments,
      offset,
      total: matching.length,
      ...(next < matching.length ? { nextOffset: next } : {}),
    }
  }

  at(_sessionId: string, time: number): TranscriptWindow {
    const index = Math.min(Math.max(Math.floor(time / 10), 0), this.segments.length - 1)
    const segment = this.segments[index]
    if (segment === undefined) throw new Error('the fake transcript is empty')
    return {
      at: time,
      segment,
      before: this.segments.slice(Math.max(index - 3, 0), index),
      after: this.segments.slice(index + 1, index + 3),
      text: `[${time}s] ${segment.text}`,
    }
  }
}

export class FakeArtifact implements ArtifactPort {
  /** Set to fail the compile the way a broken module does. */
  errors: BuildError[] | null = null

  async build(input: BuildInput): Promise<BuildResult> {
    if (this.errors !== null) return { ok: false, errors: this.errors }
    return {
      ok: true,
      bundlePath: join(input.home, 'sessions', input.sessionId, 'artifacts', `${input.id}.js`),
      bytes: input.source.length,
      warnings: [],
    }
  }
}

export class FakeHost implements HostPort {
  url: string | null = null
  pageOpen = true
  outcome: VerifyResult = { ok: true, errors: [], size: { width: 800, height: 450 }, snapshot: SNAPSHOT_PNG }

  async start(): Promise<{ url: string; port: number }> {
    this.url = 'http://127.0.0.1:4830'
    return { url: this.url, port: 4830 }
  }

  hasPage(_sessionId: string): boolean {
    return this.pageOpen
  }

  async verify(request: { sessionId: string }): Promise<VerifyResult> {
    if (!this.pageOpen) {
      fail(
        'PAGE_NOT_OPEN',
        `No page is listening to session ${request.sessionId}.`,
        'Open the session page, then verify again.',
      )
    }
    return this.outcome
  }
}

// --- the box under test ----------------------------------------------------

export interface Harness {
  client: Client
  /** The box's own surface, on the same runtime the client is talking to. */
  agentIo: AgentIo
  deps: AgentIoDeps
  store: SessionStore
  ingest: FakeIngest
  transcript: FakeTranscript
  artifact: FakeArtifact
  host: FakeHost
  home: string
  /** The session every tool acts on by default: the newest one in the process. */
  session(): Session
  call(name: string, args?: Record<string, unknown>): Promise<CallOutcome>
}

export interface CallOutcome {
  isError: boolean
  body: Record<string, unknown>
  content: { type: string; [key: string]: unknown }[]
}

export interface HarnessOptions {
  /** An existing home, so a test can build a second process on sessions already on disk. */
  home?: string
  /** Where the prompt files are read from, as the process passes it down. */
  prompts?: string
}

/** A real MCP client on one end, the real server on the other, nothing in between. */
export async function openAgentIo(t: TestContext, options: HarnessOptions = {}): Promise<Harness> {
  const reused = options.home !== undefined
  const home = options.home ?? (await mkdtemp(join(tmpdir(), 'observer-agent-io-')))
  const store = createStore({ home })
  const ingest = new FakeIngest()
  const transcript = new FakeTranscript()
  const artifact = new FakeArtifact()
  const host = new FakeHost()

  const deps: AgentIoDeps = {
    store,
    ingest,
    transcript,
    knowledge: createKnowledge({ store }),
    artifact,
    host,
    config: {
      home,
      transcript: 'auto',
      openBrowser: false,
      prompts: options.prompts ?? null,
      version: '0.0.0-test',
    },
  }

  const runtime = new Runtime(deps)
  // The same call `createAgentIo` makes, so a harness reads prompts the way the process does.
  const prompts = loadPrompts(deps.config.prompts ?? null)
  const agentIo = agentIoOn(runtime, prompts)
  const server = createServer(runtime, prompts)
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'observer-test', version: '0.0.0' })

  await Promise.all([client.connect(clientSide), server.connect(serverSide)])

  t.after(async () => {
    runtime.close()
    await client.close()
    await server.close()
    await store.close()
    // The home belongs to whoever made it: a second harness on the same one leaves it there.
    if (!reused) await rm(home, { recursive: true, force: true })
  })

  const harness: Harness = {
    client,
    agentIo,
    deps,
    store,
    ingest,
    transcript,
    artifact,
    host,
    home,
    session: () => {
      const newest = store.list()[0]
      if (newest === undefined) throw new Error('no session has been opened')
      return newest
    },
    call: async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args }, { timeout: 90_000 })
      const content = (result.content ?? []) as CallOutcome['content']
      const text = content.find((block) => block.type === 'text')
      return {
        isError: result.isError === true,
        body: text === undefined ? {} : (JSON.parse(String(text['text'])) as Record<string, unknown>),
        content,
      }
    },
  }
  return harness
}

/** Waits for something the background transcription run is about to do. */
export async function until(ready: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (ready()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(`timed out waiting for ${label}`)
}

/** `open`, plus the wait for the transcription run it started. */
export async function openSession(
  harness: Harness,
  input: Record<string, unknown> = {},
): Promise<Session> {
  const opened = await harness.call('open', { url: VIDEO_URL, ...input })
  const id = String(opened.body['sessionId'])
  await until(() => harness.store.get(id).phase !== 'transcribing', 'the transcript')
  return harness.store.get(id)
}

const CHAIN = ['transcribing', 'researching', 'building', 'ready', 'live'] as const

/** A session parked in one phase, for the calls that are not legal there. */
export async function seed(harness: Harness, phase: Session['phase']): Promise<Session> {
  let session = await harness.store.create({ source: SOURCE, settings: {} })
  for (const step of CHAIN) {
    if (session.phase === phase) break
    session = await harness.store.advance(session.id, step)
  }
  return session
}

export const CONCEPT = {
  label: 'frequency bin',
  kind: 'jargon',
  startsAt: 0,
  endsAt: DURATION,
  summary: 'One slot of the transform output.',
}

/** A prepared session with the player unlocked, one call short of running. */
export async function goReady(harness: Harness): Promise<Session> {
  const session = await openSession(harness)
  await harness.call('concepts', { concepts: [CONCEPT] })
  await harness.call('ready')
  return harness.store.get(session.id)
}

/** Drives a session all the way to `live`, the phase most of the tools work in. */
export async function goLive(harness: Harness): Promise<Session> {
  const session = await goReady(harness)
  // The first wait is what starts the session; nothing has happened yet, so it returns idle.
  await harness.call('wait', { timeoutMs: 1 })
  return harness.store.get(session.id)
}

/** A verified visual on the record, as `build` leaves one. */
export async function putBuiltArtifact(harness: Harness, id: string): Promise<Session> {
  const session = harness.session()
  return harness.store.putArtifact(session.id, {
    id,
    title: `Visual ${id}`,
    kind: 'chart',
    status: 'built',
    bundlePath: `sessions/${session.id}/artifacts/${id}.js`,
  })
}
