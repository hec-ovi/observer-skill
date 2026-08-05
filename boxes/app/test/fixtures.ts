/**
 * A session record and a transcript to drive the page with, in the shapes `web-host` serves.
 */

import type { Segment } from '@dialogue/index.ts'
import type { LogEntry, Session } from '../src/session/record.ts'

const AT = '2026-08-05T10:00:00.000Z'

/** Seconds per sentence, which is what makes a segment index predictable from a time. */
export const STEP = 2

export function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    createdAt: AT,
    updatedAt: AT,
    source: {
      provider: 'fake',
      videoId: 'v1',
      url: 'https://example.com/watch?v=v1',
      title: 'Attention, explained',
      channel: 'A channel',
      duration: 600,
      publishedAt: '2026-01-01',
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
    transcript: { provider: 'captions', language: 'en', segmentCount: 100, duration: 200 },
    concepts: [],
    artifacts: [],
    position: { time: 0, state: 'idle' },
    agent: { attached: true, lastSeen: AT },
    log: [],
    cursor: 0,
    ...over,
  }
}

export function segmentsOf(count: number): Segment[] {
  const segments: Segment[] = []
  for (let i = 0; i < count; i += 1) {
    segments.push({ i, start: i * STEP, end: i * STEP + STEP, text: `Sentence ${i}.` })
  }
  return segments
}

export function answer(text: string, over: Partial<LogEntry> = {}): LogEntry {
  return { id: 'e1', role: 'agent', text, at: 0, artifactId: null, spoken: false, ...over }
}
