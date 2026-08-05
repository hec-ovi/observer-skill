/**
 * What a tool call looks like on the wire. A failure is a tool result marked as an error,
 * never a protocol error, so the agent reads it and recovers in the same turn.
 */

import type { CallToolResult, ContentBlock } from '@modelcontextprotocol/server'
import { toErrorShape } from '#errors'
import type { Phase } from '#session'
import { nextCall } from './phases.ts'

/**
 * The body goes out twice: as the text block every client can read, and as structured
 * content for the ones that use the output schema. `budget.ts` sizes results for both.
 */
export function toolResult(
  body: Record<string, unknown>,
  phase: Phase,
  attachments: readonly ContentBlock[],
): CallToolResult {
  const structuredContent = { ...body, phase }
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }, ...attachments],
    structuredContent,
  }
}

export function errorResult(error: unknown, phase: Phase | null): CallToolResult {
  const shape = toErrorShape(error)
  const body = phase === null ? { error: shape } : { error: shape, phase, next: nextCall(phase) }
  return {
    content: [{ type: 'text', text: JSON.stringify(body) }],
    isError: true,
  }
}
