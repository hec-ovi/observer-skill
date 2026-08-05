/**
 * The page opens sessions too: its feed screen posts a URL, and `web-host` calls the method
 * this box exports. What comes out has to be the session the `open` tool would have made,
 * because from that point on the agent works it with the same tools.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Session } from '#session'
import { VIDEO_URL, openAgentIo, openSession, until } from '../fixtures.ts'

/** Everything about a session that is not its identity or its clock. */
function shapeOf(session: Session): Record<string, unknown> {
  return {
    phase: session.phase,
    settings: session.settings,
    source: session.source,
    userPrompt: session.userPrompt,
    transcript: session.transcript,
    attached: session.agent.attached,
  }
}

describe('openSession', () => {
  it('leaves the same session the open tool leaves', async (t) => {
    const fromTool = await openAgentIo(t)
    const fromPage = await openAgentIo(t)

    const byTool = await openSession(fromTool, {
      userPrompt: 'the training setup',
      extraKnowledge: false,
    })
    const opened = await fromPage.agentIo.openSession({
      url: VIDEO_URL,
      userPrompt: 'the training setup',
      settings: { extraKnowledge: false },
    })
    await until(
      () => fromPage.store.get(opened.id).phase !== 'transcribing',
      'the transcript',
    )

    assert.equal(opened.phase, 'transcribing')
    assert.deepEqual(shapeOf(fromPage.store.get(opened.id)), shapeOf(byTool))
  })

  it('hands the agent a session it finds without being told the id', async (t) => {
    const harness = await openAgentIo(t)

    const opened = await harness.agentIo.openSession({ url: VIDEO_URL })
    await until(() => harness.store.get(opened.id).phase !== 'transcribing', 'the transcript')

    const status = await harness.call('status')

    assert.equal(status.isError, false)
    assert.equal(status.body['sessionId'], opened.id)
    assert.equal(status.body['phase'], 'researching')
    assert.match(String(status.body['pageUrl']), /^http:\/\/127\.0\.0\.1:4830\/s\//)
    assert.equal((status.body['counts'] as { segments: number }).segments, 360)
  })

  it('refuses a video the player will never load, the way the tool does', async (t) => {
    const harness = await openAgentIo(t)
    harness.ingest.source = { ...harness.ingest.source, embeddable: false }

    await assert.rejects(
      harness.agentIo.openSession({ url: VIDEO_URL }),
      (error: { code?: string }) => error.code === 'SOURCE_NOT_EMBEDDABLE',
    )
    assert.equal(harness.store.list().length, 0)
  })
})
