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

  async fetch(): Promise<TranscriptRef> {
    if (this.failWith !== null) {
      fail('NO_TRANSCRIPT', this.failWith, 'Point OBSERVER_TRANSCRIPT at a provider.')
    }
    return {
      provider: 'captions',
      language: 'en',
      segmentCount: this.segments.length,
      duration: DURATION,
      generated: false,
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

/** A real MCP client on one end, the real server on the other, nothing in between. */
export async function openAgentIo(t: TestContext): Promise<Harness> {
  const home = await mkdtemp(join(tmpdir(), 'observer-agent-io-'))
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
    config: { home, transcript: 'auto', openBrowser: false, version: '0.0.0-test' },
  }

  const runtime = new Runtime(deps)
  const server = createServer(runtime, loadPrompts())
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'observer-test', version: '0.0.0' })

  await Promise.all([client.connect(clientSide), server.connect(serverSide)])

  t.after(async () => {
    runtime.close()
    await client.close()
    await server.close()
    await store.close()
    await rm(home, { recursive: true, force: true })
  })

  const harness: Harness = {
    client,
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

/** A session sitting in the phase a test needs, with the transcript already in. */
export async function openSession(harness: Harness): Promise<Session> {
  const opened = await harness.call('open', { url: VIDEO_URL })
  const sessionId = String(opened.body['sessionId'])
  await settle()
  return harness.store.get(sessionId)
}

/** Lets the transcription run behind `open` finish before the test reads the phase. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setImmediate(resolve))
}

/** Drives a session all the way to `live`, the phase most of the tools work in. */
export async function goLive(harness: Harness): Promise<Session> {
  const session = await openSession(harness)
  await harness.call('concepts', {
    concepts: [
      {
        label: 'frequency bin',
        kind: 'jargon',
        startsAt: 0,
        endsAt: DURATION,
        summary: 'One slot of the transform output.',
      },
    ],
  })
  await harness.call('ready')
  // The first wait is what starts the session; nothing has happened yet, so it returns idle.
  await harness.call('wait', { timeoutMs: 1 })
  return harness.store.get(session.id)
}
