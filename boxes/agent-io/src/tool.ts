/**
 * One tool is one file exporting one of these. The registry is the list of them, and the
 * phase table is generated from what they declare, so a tool cannot be legal in a phase it
 * never named.
 */

import type * as z from 'zod/v4'
import type { ContentBlock } from '@modelcontextprotocol/server'
import type { Phase, Session } from '#session'
import type { Runtime } from './runtime.ts'

export interface ToolCall {
  readonly runtime: Runtime
  /** Aborted when the client cancels or the transport closes. */
  readonly signal: AbortSignal
  /** The session this call targets. `null` only for `open`, which creates one. */
  readonly session: Session | null
  /** The targeted session. Every tool that takes a `sessionId` has one by the time it runs. */
  require(): Session
  /** Put a content block beside the result body, for a picture the agent should look at. */
  attach(block: ContentBlock): void
}

export interface Tool {
  readonly name: string
  readonly description: string
  /** The phases this tool is legal in. Anything else answers `WRONG_PHASE`. */
  readonly phases: readonly Phase[]
  readonly input: z.ZodObject
  /** The result body. The phase is added to it by the dispatcher. */
  readonly output: z.ZodObject
  run(input: never, call: ToolCall): Promise<Record<string, unknown>>
}

interface ToolDefinition<Input extends z.ZodObject, Output extends z.ZodObject> {
  name: string
  description: string
  phases: readonly Phase[]
  input: Input
  output: Output
  run(input: z.infer<Input>, call: ToolCall): Promise<z.infer<Output>>
}

/** Keeps each tool's own types while the registry holds them all as one list. */
export function defineTool<Input extends z.ZodObject, Output extends z.ZodObject>(
  definition: ToolDefinition<Input, Output>,
): Tool {
  return definition as unknown as Tool
}
