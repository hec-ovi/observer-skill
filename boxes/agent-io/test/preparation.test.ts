/**
 * The tools that run before the video does, each through a real MCP client: what they do
 * when they are called in their phase, and what they say when they are not.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CONCEPT,
  DURATION,
  VIDEO_URL,
  goLive,
  openAgentIo,
  openSession,
  seed,
} from '../fixtures.ts'

describe('open', () => {
  it('resolves the source, starts the page, and transcribes without being waited on', async (t) => {
    const harness = await openAgentIo(t)

    const result = await harness.call('open', { url: VIDEO_URL, userPrompt: 'the training setup' })

    assert.equal(result.isError, false)
    assert.equal(result.body['phase'], 'transcribing')
    assert.match(String(result.body['pageUrl']), /^http:\/\/127\.0\.0\.1:4830\/s\//)
    assert.equal(harness.session().userPrompt, 'the training setup')

    const session = await openSession(harness)
    assert.equal(session.phase, 'researching')
    assert.equal(session.transcript?.segmentCount, harness.transcript.segments.length)
  })

  it('refuses a video the player will never load', async (t) => {
    const harness = await openAgentIo(t)
    harness.ingest.source = { ...harness.ingest.source, embeddable: false }

    const result = await harness.call('open', { url: VIDEO_URL })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'SOURCE_NOT_EMBEDDABLE')
    assert.equal(harness.store.list().length, 0)
  })

  it('records a transcription failure on the session instead of losing it', async (t) => {
    const harness = await openAgentIo(t)
    harness.transcript.failWith = 'This video has no captions.'

    const opened = await harness.call('open', { url: VIDEO_URL })
    const id = String(opened.body['sessionId'])

    const status = await pollUntilError(harness, id)
    assert.equal((status.body['error'] as { code: string }).code, 'NO_TRANSCRIPT')
    assert.equal(status.body['phase'], 'transcribing')
  })
})

async function pollUntilError(
  harness: Awaited<ReturnType<typeof openAgentIo>>,
  id: string,
): Promise<{ isError: boolean; body: Record<string, unknown> }> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const status = await harness.call('status', { sessionId: id })
    if (status.body['error'] !== null) return status
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('the transcription failure never reached the record')
}

describe('status', () => {
  it('reports the phase, the counts, and what is still owed', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)

    const result = await harness.call('status')

    assert.equal(result.isError, false)
    assert.equal(result.body['phase'], 'researching')
    assert.equal(result.body['pageOpen'], true)
    assert.deepEqual(result.body['counts'], {
      segments: 360,
      concepts: 0,
      notes: 0,
      artifacts: 0,
      answers: 0,
    })
    assert.deepEqual(result.body['missing'], ['concepts', 'visuals', 'ready'])
  })

  it('says so when the session named does not exist', async (t) => {
    const harness = await openAgentIo(t)

    const result = await harness.call('status', { sessionId: 'nothing' })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'UNKNOWN_SESSION')
  })
})

describe('transcript', () => {
  it('reads a page of segments and says how to get the next one', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)

    const result = await harness.call('transcript', { from: 0, to: 100 })

    assert.equal(result.isError, false)
    assert.equal(result.body['offset'], 0)
    assert.equal(result.body['generated'], false)
    assert.equal((result.body['segments'] as unknown[]).length, 11)
    assert.equal(result.body['nextOffset'], undefined)
  })

  it('refuses to read while the transcript is still being made', async (t) => {
    const harness = await openAgentIo(t)
    const session = await seed(harness, 'transcribing')

    const result = await harness.call('transcript', { sessionId: session.id })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'WRONG_PHASE')
    assert.equal(result.body['next'], 'status')
  })
})

describe('concepts', () => {
  it('writes the list and merges a second pass into it', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)

    const first = await harness.call('concepts', { concepts: [CONCEPT] })
    assert.equal(first.isError, false)
    assert.equal(first.body['total'], 1)

    const written = first.body['written'] as { id: string; label: string }[]
    assert.equal(written[0]?.label, 'frequency bin')

    const second = await harness.call('concepts', {
      concepts: [{ ...CONCEPT, label: 'Frequency Bin', endsAt: DURATION }],
    })
    assert.equal(second.body['total'], 1)
  })

  it('refuses to write while the transcript is still being made', async (t) => {
    const harness = await openAgentIo(t)
    const session = await seed(harness, 'transcribing')

    const result = await harness.call('concepts', { sessionId: session.id, concepts: [CONCEPT] })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'WRONG_PHASE')
  })
})

describe('note', () => {
  it('attaches research to a concept', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)
    const written = await harness.call('concepts', { concepts: [CONCEPT] })
    const conceptId = (written.body['written'] as { id: string }[])[0]?.id ?? ''

    const result = await harness.call('note', {
      conceptId,
      notes: [
        { kind: 'background', text: 'A bin is one output slot of the transform.' },
        { kind: 'current', text: 'Since 2025 the fast path is a fused kernel.', source: 'https://example.org' },
      ],
    })

    assert.equal(result.isError, false)
    assert.equal(result.body['noteCount'], 2)
    assert.equal(harness.session().concepts[0]?.notes[1]?.kind, 'current')
  })

  it('refuses to attach while the transcript is still being made', async (t) => {
    const harness = await openAgentIo(t)
    const session = await seed(harness, 'transcribing')

    const result = await harness.call('note', {
      sessionId: session.id,
      conceptId: 'anything',
      notes: [{ kind: 'background', text: 'x' }],
    })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'WRONG_PHASE')
  })
})

describe('ready', () => {
  it('closes preparation and unlocks the player', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)
    await harness.call('concepts', { concepts: [CONCEPT] })

    const result = await harness.call('ready')

    assert.equal(result.isError, false)
    assert.equal(result.body['phase'], 'ready')
    assert.deepEqual(result.body['counts'], {
      segments: 360,
      concepts: 1,
      notes: 0,
      artifacts: 0,
      answers: 0,
    })
    assert.match(String(result.body['pageUrl']), /\/s\//)
  })

  it('refuses once the session is already live', async (t) => {
    const harness = await openAgentIo(t)
    await goLive(harness)

    const result = await harness.call('ready')

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'WRONG_PHASE')
    assert.equal(result.body['next'], 'wait')
  })
})
