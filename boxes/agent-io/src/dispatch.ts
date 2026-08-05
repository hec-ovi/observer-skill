/**
 * One tool call, start to finish: mark the agent present, check the phase, run the tool,
 * and stamp the result with the phase the session was left in.
 */

import type { CallToolResult, ContentBlock, ServerContext } from '@modelcontextprotocol/server'
import type { Phase, Session } from '#session'
import { isLegal, wrongPhase } from './phases.ts'
import { errorResult, toolResult } from './results.ts'
import type { Runtime } from './runtime.ts'
import type { Tool, ToolCall } from './tool.ts'

/** `open` is the one tool with no session to point at: it is the call that makes one. */
function targetsSession(tool: Tool): boolean {
  return 'sessionId' in tool.input.shape
}

function requestedSessionId(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const value = (args as { sessionId?: unknown }).sessionId
  return typeof value === 'string' ? value : undefined
}

/** The session the result should report the phase of, once the tool has run. */
function stampedPhase(runtime: Runtime, body: Record<string, unknown>, session: Session | null): Phase {
  const created = body['sessionId']
  const id = typeof created === 'string' ? created : session?.id
  return id === undefined ? 'feed' : runtime.deps.store.get(id).phase
}

export async function dispatch(
  runtime: Runtime,
  tool: Tool,
  args: unknown,
  ctx: ServerContext,
): Promise<CallToolResult> {
  let session: Session | null = null
  try {
    if (targetsSession(tool)) {
      const found = runtime.session(requestedSessionId(args))
      // Every call is a sign of life, so the page can show that somebody is listening.
      session = await runtime.deps.store.touchAgent(found.id)
      if (!isLegal(tool, session.phase)) throw wrongPhase(tool.name, session.phase)
    }

    const attachments: ContentBlock[] = []
    const call: ToolCall = {
      runtime,
      signal: ctx.mcpReq.signal,
      session,
      require: () => {
        if (session === null) throw new Error(`${tool.name} ran without a session`)
        return session
      },
      attach: (block) => attachments.push(block),
    }

    const body = await tool.run(args as never, call)
    return toolResult(body, stampedPhase(runtime, body, session), attachments)
  } catch (error) {
    return errorResult(error, session === null ? null : runtime.deps.store.get(session.id).phase)
  }
}
