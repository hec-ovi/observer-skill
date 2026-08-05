/**
 * The gate is generated from what the tools declare, so this is where the declarations are
 * held to the contract: every tool listed, every tool in a phase, and the phase table itself.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Phase } from '#session'
import { phaseTable } from '../src/phases.ts'
import { TOOLS } from '../src/tools/registry.ts'
import { openAgentIo } from '../fixtures.ts'

const EXPECTED: Record<Phase, string[]> = {
  feed: ['open', 'status'],
  transcribing: ['status'],
  researching: ['status', 'transcript', 'concepts', 'note', 'build', 'ready'],
  building: ['status', 'transcript', 'concepts', 'note', 'build', 'link', 'ready'],
  ready: ['status', 'transcript', 'concepts', 'note', 'build', 'link', 'wait'],
  live: [
    'status',
    'transcript',
    'concepts',
    'note',
    'build',
    'link',
    'wait',
    'where',
    'say',
    'show',
    'hide',
  ],
}

describe('the tool registry', () => {
  it('lists every tool to every client, whatever the phase', async (t) => {
    const harness = await openAgentIo(t)

    const listed = await harness.client.listTools()

    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      TOOLS.map((tool) => tool.name).sort(),
    )
    assert.equal(listed.tools.length, 13)
  })

  it('describes every tool in a line or two, and declares its schemas', async (t) => {
    const harness = await openAgentIo(t)

    for (const tool of (await harness.client.listTools()).tools) {
      const description = tool.description ?? ''
      assert.ok(description.length > 0, `${tool.name} has no description`)
      assert.ok(description.length < 260, `${tool.name} explains too much; that is a prompt`)
      assert.equal(tool.inputSchema.type, 'object')
      assert.ok(tool.outputSchema, `${tool.name} declares no result shape`)
    }
  })

  it('gives every tool at least one phase to be legal in', () => {
    for (const tool of TOOLS) {
      assert.ok(tool.phases.length > 0, `${tool.name} declares no phase`)
    }
  })

  it('generates the phase table from the declarations', () => {
    assert.deepEqual(phaseTable(TOOLS), EXPECTED)
  })

  it('takes an optional sessionId everywhere but the call that makes one', () => {
    for (const tool of TOOLS) {
      const declared = 'sessionId' in tool.input.shape
      assert.equal(declared, tool.name !== 'open', `${tool.name} disagrees about sessionId`)
    }
  })
})
