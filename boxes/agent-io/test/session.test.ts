/**
 * The live session: waiting on the user, reading where they are, answering, and moving the
 * stage. Every one of these is only legal once the player is unlocked.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Signal } from '#session'
import { goLive, openAgentIo, putBuiltArtifact, seed } from '../fixtures.ts'

/** What the page would receive, so a test can prove the answer reached the channel. */
function signals(harness: Awaited<ReturnType<typeof openAgentIo>>, sessionId: string): Signal[] {
  const seen: Signal[] = []
  harness.store.subscribe(sessionId, (message) => {
    if (message.type === 'signal') seen.push(message.signal)
  })
  return seen
}

describe('wait', () => {
  it('returns the question with the context to answer it already attached', async (t) => {
    const harness = await openAgentIo(t)
    const session = await goLive(harness)
    await harness.store.push(session.id, { kind: 'ask', text: 'what is a bin', at: 120 })

    const result = await harness.call('wait', { timeoutMs: 2000 })

    assert.equal(result.isError, false)
    assert.equal(result.body['idle'], false)
    assert.equal(result.body['next'], 'say')

    const events = result.body['events'] as {
      kind: string
      at: number
      text: string
      context: { window: string; concepts: { label: string }[] }
    }[]
    assert.equal(events.length, 1)
    assert.equal(events[0]?.kind, 'ask')
    assert.equal(events[0]?.text, 'what is a bin')
    assert.match(String(events[0]?.context.window), /\[120s\]/)
    assert.equal(events[0]?.context.concepts[0]?.label, 'frequency bin')
  })

  it('refuses before the player is unlocked', async (t) => {
    const harness = await openAgentIo(t)
    const session = await seed(harness, 'researching')

    const result = await harness.call('wait', { sessionId: session.id, timeoutMs: 1 })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'WRONG_PHASE')
    assert.equal(result.body['next'], 'concepts')
  })
})

describe('where', () => {
  it('answers with the same context on demand', async (t) => {
    const harness = await openAgentIo(t)
    const session = await goLive(harness)
    await harness.store.patch(session.id, { position: { time: 300, state: 'paused' } })

    const result = await harness.call('where')

    assert.equal(result.isError, false)
    assert.equal(result.body['time'], 300)
    assert.equal(result.body['state'], 'paused')
    assert.match(String(result.body['window']), /\[300s\]/)
    assert.equal((result.body['concepts'] as { label: string }[])[0]?.label, 'frequency bin')
  })

  it('refuses before the player is unlocked', async (t) => {
    const harness = await openAgentIo(t)
    const session = await seed(harness, 'ready')

    const result = await harness.call('where', { sessionId: session.id })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'WRONG_PHASE')
  })
})

describe('say', () => {
  it('logs the answer and sends it to the page', async (t) => {
    const harness = await openAgentIo(t)
    const session = await goLive(harness)
    const sent = signals(harness, session.id)
    await putBuiltArtifact(harness, 'bins')

    const result = await harness.call('say', {
      text: 'One output slot of the transform.',
      speak: true,
      artifactId: 'bins',
    })

    assert.equal(result.isError, false)
    const entryId = String(result.body['entryId'])
    const logged = harness.session().log.at(-1)
    assert.equal(logged?.id, entryId)
    assert.equal(logged?.role, 'agent')
    assert.equal(logged?.spoken, true)
    assert.deepEqual(sent, [
      {
        type: 'say',
        entryId,
        text: 'One output slot of the transform.',
        speak: true,
        artifactId: 'bins',
      },
    ])
  })

  it('refuses before the player is unlocked', async (t) => {
    const harness = await openAgentIo(t)
    const session = await seed(harness, 'ready')

    const result = await harness.call('say', { sessionId: session.id, text: 'too early' })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'WRONG_PHASE')
    assert.equal(result.body['next'], 'wait')
  })
})

describe('show and hide', () => {
  it('moves the stage to a visual and back to the video', async (t) => {
    const harness = await openAgentIo(t)
    const session = await goLive(harness)
    const sent = signals(harness, session.id)
    await putBuiltArtifact(harness, 'bins')

    const shown = await harness.call('show', { artifactId: 'bins' })
    assert.equal(shown.body['shown'], 'bins')

    const hidden = await harness.call('hide')
    assert.equal(hidden.body['shown'], null)

    assert.deepEqual(sent, [{ type: 'show', artifactId: 'bins' }, { type: 'hide' }])
  })

  it('refuses to show a visual this session never built', async (t) => {
    const harness = await openAgentIo(t)
    await goLive(harness)

    const result = await harness.call('show', { artifactId: 'nothing' })

    assert.equal(result.isError, true)
    assert.equal((result.body['error'] as { code: string }).code, 'UNKNOWN_ARTIFACT')
  })

  it('both refuse before the player is unlocked', async (t) => {
    const harness = await openAgentIo(t)
    const session = await seed(harness, 'ready')

    const shown = await harness.call('show', { sessionId: session.id, artifactId: 'bins' })
    const hidden = await harness.call('hide', { sessionId: session.id })

    assert.equal((shown.body['error'] as { code: string }).code, 'WRONG_PHASE')
    assert.equal((hidden.body['error'] as { code: string }).code, 'WRONG_PHASE')
  })
})
