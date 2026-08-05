/**
 * `web-host`, as far as the page can tell: the four REST routes it calls, and the live
 * channel it follows.
 *
 * Every answer is set from the test, and every upstream post is recorded, so a test asserts
 * what actually reached the wire rather than what a component meant to send.
 */

import { act } from 'react'
import { vi } from 'vitest'
import type { Segment } from '@dialogue/index.ts'
import { FakeEventSource } from '../testing/fakes.ts'
import type { NewSession } from '../src/session/api.ts'
import type { UpstreamEvent } from '../src/session/events.ts'
import type { Failure, Session } from '../src/session/record.ts'

export interface FakeServer {
  /** What `GET /api/session/:id` answers with: what a load or a reload finds. */
  record: Session
  /** What `POST /api/session` answers with, unless it is refused. */
  created: Session
  segments: Segment[]
  /** Refuse the next session creation with this. */
  refusal: Failure | null
  /** What the page posted upstream, in order. */
  posted: UpstreamEvent[]
  /** What the page asked to create. */
  creations: NewSession[]
}

function reply(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

export function serve(record: Session, segments: Segment[] = []): FakeServer {
  const server: FakeServer = {
    record,
    created: record,
    segments,
    refusal: null,
    posted: [],
    creations: [],
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const { pathname } = new URL(String(input), location.origin)
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null

      if (pathname === '/api/session') {
        if (server.refusal) return reply(409, server.refusal)
        server.creations.push(body as NewSession)
        return reply(201, server.created)
      }
      if (pathname.endsWith('/transcript')) {
        return reply(200, { segments: server.segments, offset: 0, total: server.segments.length })
      }
      if (pathname.startsWith('/api/session/')) return reply(200, server.record)
      if (pathname.endsWith('/event')) {
        server.posted.push(body as UpstreamEvent)
        return reply(202, { ok: true })
      }
      return reply(404, { code: 'UNKNOWN_ARTIFACT', message: `nothing at ${pathname}`, hint: '' })
    }),
  )

  return server
}

/** One event down the live channel, delivered the way the server would deliver it. */
export function push(type: string, data: unknown = {}): void {
  act(() => FakeEventSource.last().emit(data, type))
}

/** The upstream events of one kind, in order. */
export function postedOf<T extends UpstreamEvent['type']>(
  server: FakeServer,
  type: T,
): Extract<UpstreamEvent, { type: T }>[] {
  return server.posted.filter((event) => event.type === type) as Extract<
    UpstreamEvent,
    { type: T }
  >[]
}
