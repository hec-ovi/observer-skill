/**
 * The six prompts are files. This proves the server finds them, renders each one, and
 * appends the ad guidance to the preparation prompts when the user said the video has ads.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PROMPT_NAMES } from '../src/prompts.ts'
import { VIDEO_URL, openAgentIo } from '../fixtures.ts'

async function textOf(
  harness: Awaited<ReturnType<typeof openAgentIo>>,
  name: string,
): Promise<string> {
  const prompt = await harness.client.getPrompt({ name })
  const first = prompt.messages[0]
  assert.ok(first, `${name} rendered no message`)
  assert.equal(first.content.type, 'text')
  return first.content.type === 'text' ? first.content.text : ''
}

describe('prompts', () => {
  it('lists the six the agent works from', async (t) => {
    const harness = await openAgentIo(t)

    const listed = await harness.client.listPrompts()

    assert.deepEqual(
      listed.prompts.map((prompt) => prompt.name).sort(),
      [...PROMPT_NAMES].sort(),
    )
    for (const prompt of listed.prompts) {
      assert.ok((prompt.description ?? '').length > 0, `${prompt.name} has no description`)
    }
  })

  it('renders every one from its own file', async (t) => {
    const harness = await openAgentIo(t)

    for (const name of PROMPT_NAMES) {
      const text = await textOf(harness, name)
      assert.ok(text.startsWith('#'), `${name} did not come from its markdown file`)
      assert.ok(text.length > 200, `${name} rendered almost nothing`)
    }
  })

  it('leaves the ad guidance out when the video carries no ads', async (t) => {
    const harness = await openAgentIo(t)
    await harness.call('open', { url: VIDEO_URL })

    const plan = await textOf(harness, 'study-plan')

    assert.match(plan, /^# Study plan/)
    assert.doesNotMatch(plan, /Ads in the transcript/)
  })

  it('appends it to the preparation prompts when the user said there are ads', async (t) => {
    const harness = await openAgentIo(t)
    await harness.call('open', { url: VIDEO_URL, hasAds: true })

    for (const name of ['study-plan', 'research', 'visual-plan']) {
      assert.match(await textOf(harness, name), /Ads in the transcript/, `${name} lost the ads`)
    }
    // Authoring and answering are not preparation passes; they stay as written.
    assert.doesNotMatch(await textOf(harness, 'artifact-authoring'), /Ads in the transcript/)
    assert.doesNotMatch(await textOf(harness, 'session-answer'), /Ads in the transcript/)
  })
})
