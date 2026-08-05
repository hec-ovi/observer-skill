/**
 * The whole server, started the way a client starts it: `node bin/observer.ts mcp` as a child
 * process, spoken to over stdio by a real MCP client. Every box is the real one, so a wiring
 * mistake anywhere below shows up here as a server that answers nothing.
 */

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, it } from 'node:test'
import type { TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio'

import { createStore } from '#session'
import type { Phase } from '#session'

const OBSERVER = fileURLToPath(new URL('../observer.ts', import.meta.url))

/** Every tool the agent sees, and the order the session moves through them. */
const TOOLS = [
  'open',
  'status',
  'transcript',
  'concepts',
  'note',
  'build',
  'link',
  'ready',
  'wait',
  'where',
  'say',
  'show',
  'hide',
]

const PROMPTS = [
  'study-plan',
  'research',
  'visual-plan',
  'artifact-authoring',
  'session-answer',
  'ads',
]

interface Spawned {
  client: Client
  transport: StdioClientTransport
}

/** A temp home, and the CLI spawned against it exactly as an agent would spawn it. */
async function spawnObserver(t: TestContext, home: string): Promise<Spawned> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [OBSERVER, 'mcp'],
    env: { ...getDefaultEnvironment(), OBSERVER_HOME: home, OBSERVER_OPEN: '0' },
  })
  const client = new Client({ name: 'observer-cli-test', version: '0.0.0' })
  await client.connect(transport)
  t.after(async () => {
    await client.close()
    await rm(home, { recursive: true, force: true })
  })
  return { client, transport }
}

async function emptyHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'observer-cli-'))
}

const CHAIN: Phase[] = ['transcribing', 'researching', 'building', 'ready', 'live']

/**
 * A home holding one session parked in a phase, written by the real store so the process under
 * test reads back what an earlier run left. Nothing else reaches a phase without the network.
 */
async function homeWithSession(phase: Phase): Promise<string> {
  const home = await emptyHome()
  const store = createStore({ home })
  let session = await store.create({
    source: {
      provider: 'youtube',
      videoId: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'How a Fourier transform works',
    },
    settings: {},
  })
  for (const step of CHAIN) {
    if (session.phase === phase) break
    session = await store.advance(session.id, step)
  }
  await store.close()
  return home
}

interface Answer {
  isError: boolean
  body: Record<string, unknown>
}

/** The result body every tool returns, as the text block a client reads it from. */
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Answer> {
  const result = await client.callTool({ name, arguments: args }, { timeout: 30_000 })
  const content = (result.content ?? []) as { type: string; text?: string }[]
  const text = content.find((block) => block.type === 'text')?.text
  return {
    isError: result.isError === true,
    body: text === undefined ? {} : (JSON.parse(text) as Record<string, unknown>),
  }
}

function errorOf(answer: Answer): { code: string; message: string; hint: string } {
  return answer.body['error'] as { code: string; message: string; hint: string }
}

describe('observer mcp', () => {
  it('serves every tool, each one saying what it is for', async (t) => {
    const { client } = await spawnObserver(t, await emptyHome())

    const { tools } = await client.listTools()

    assert.deepEqual(
      tools.map((tool) => tool.name).sort(),
      [...TOOLS].sort(),
    )
    for (const tool of tools) {
      assert.ok((tool.description ?? '').length > 0, `${tool.name} has no description`)
    }
  })

  it('serves every prompt', async (t) => {
    const { client } = await spawnObserver(t, await emptyHome())

    const { prompts } = await client.listPrompts()

    assert.deepEqual(
      prompts.map((prompt) => prompt.name).sort(),
      [...PROMPTS].sort(),
    )
  })

  it('answers status with no session instead of falling over', async (t) => {
    const { client } = await spawnObserver(t, await emptyHome())

    const answer = await call(client, 'status')

    assert.equal(answer.isError, true)
    assert.equal(errorOf(answer).code, 'UNKNOWN_SESSION')
    assert.match(errorOf(answer).hint, /open/)
    // The server is still there: a readable refusal, not a dead connection.
    const { tools } = await client.listTools()
    assert.equal(tools.length, TOOLS.length)
  })

  it('refuses a tool called in the wrong phase and names the call to make', async (t) => {
    const { client } = await spawnObserver(t, await homeWithSession('transcribing'))

    const answer = await call(client, 'transcript')

    assert.equal(answer.isError, true)
    assert.equal(errorOf(answer).code, 'WRONG_PHASE')
    assert.equal(answer.body['next'], 'status')
    assert.match(errorOf(answer).hint, /`status`/)
  })

  // `concepts` is the one tool that writes through `knowledge`, so this is what proves that
  // box was handed the same store the rest of the process works on.
  it('writes a concept through the knowledge box the session was built with', async (t) => {
    const { client } = await spawnObserver(t, await homeWithSession('researching'))

    const answer = await call(client, 'concepts', {
      concepts: [{ label: 'frequency bin', kind: 'jargon', startsAt: 0, endsAt: 60 }],
    })

    assert.equal(answer.isError, false)
    assert.deepEqual((answer.body['written'] as { label: string }[]).map((c) => c.label), [
      'frequency bin',
    ])
    assert.equal(answer.body['total'], 1)
  })

  it('shuts the process down when the client goes away', async (t) => {
    const { client, transport } = await spawnObserver(t, await emptyHome())
    const pid = transport.pid
    assert.ok(pid !== null, 'the transport never spawned a process')

    await client.close()

    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        process.kill(pid, 0)
      } catch {
        return
      }
      await delay(25)
    }
    assert.fail(`process ${pid} was still running five seconds after the client closed`)
  })
})
