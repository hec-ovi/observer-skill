/**
 * The REST half of `web-host`: the record on load, the transcript once, a session created
 * from a pasted URL, and one upstream event at a time.
 *
 * The record is read here exactly once per connection. Everything after it arrives on the
 * live channel, so nothing in the page polls.
 */

import type { Segment } from '@dialogue/index.ts'
import type { UpstreamEvent } from './events.ts'
import type { Failure, Session, SettingsPatch } from './record.ts'

/** The largest page `web-host` will serve. */
const PAGE_SIZE = 1000

const UNREADABLE: Failure = {
  code: 'INTERNAL',
  message: 'The page could not reach the session server.',
  hint: 'Check that Observer is still running, then reload.',
}

export class ApiError extends Error {
  readonly failure: Failure

  constructor(failure: Failure) {
    super(failure.message)
    this.name = 'ApiError'
    this.failure = failure
  }
}

/** Anything thrown on the way to the server, as the shape the page shows. */
export function failureOf(error: unknown): Failure {
  if (error instanceof ApiError) return error.failure
  return { ...UNREADABLE, message: error instanceof Error ? error.message : String(error) }
}

function isFailure(body: unknown): body is Failure {
  return typeof body === 'object' && body !== null && 'code' in body && 'message' in body
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function ask<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (cause) {
    throw new ApiError({ ...UNREADABLE, message: String(cause) })
  }

  const body = await readBody(response)
  if (!response.ok) throw new ApiError(isFailure(body) ? body : UNREADABLE)
  return body as T
}

function asJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export interface NewSession {
  url: string
  /** The user's word that this video carries ad reads, so the agent reads them as noise. */
  hasAds: boolean
  settings: SettingsPatch
  userPrompt: string | null
}

export function createSession(input: NewSession): Promise<Session> {
  return ask<Session>('/api/session', asJson(input))
}

export function readSession(sessionId: string): Promise<Session> {
  return ask<Session>(`/api/session/${encodeURIComponent(sessionId)}`)
}

interface TranscriptPage {
  segments: Segment[]
  offset: number
  total: number
  nextOffset?: number
}

/** The whole transcript, paged until it is here. The rail never asks for more. */
export async function readTranscript(sessionId: string): Promise<Segment[]> {
  const id = encodeURIComponent(sessionId)
  const segments: Segment[] = []
  let offset = 0

  for (;;) {
    const page = await ask<TranscriptPage>(
      `/api/session/${id}/transcript?offset=${offset}&limit=${PAGE_SIZE}`,
    )
    segments.push(...page.segments)
    if (page.nextOffset === undefined || page.segments.length === 0) return segments
    offset = page.nextOffset
  }
}

export function sendUpstream(sessionId: string, event: UpstreamEvent): Promise<void> {
  return ask(`/live/${encodeURIComponent(sessionId)}/event`, asJson(event))
}
