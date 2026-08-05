/**
 * The surface this box hands the process: the MCP server on stdio, and the door a session
 * can be opened through without an agent asking. Both are built on one runtime, so the two
 * ways in reach the same sessions, the same waiters, and the same transcription runs.
 */

import type { Session } from '#session'
import type { OpenSessionInput } from './open-session.ts'
import { openSession } from './open-session.ts'
import type { PromptFile } from './prompts.ts'
import type { Runtime } from './runtime.ts'
import { serveOnStdio } from './serve.ts'

export interface AgentIo {
  /** Speaks MCP on stdin and stdout until the stream closes, then shuts down. */
  serve(): Promise<void>
  /**
   * Opens a session from a URL and returns the record, the way the `open` tool does: it is
   * the same path. This is what `web-host` calls for `POST /api/session`, so a video pasted
   * in the page is a session the agent finds with `status`.
   */
  openSession(input: OpenSessionInput): Promise<Session>
}

export function agentIoOn(runtime: Runtime, prompts: readonly PromptFile[]): AgentIo {
  return {
    serve: () => serveOnStdio(runtime, prompts),
    openSession: async (input) => (await openSession(runtime, input)).session,
  }
}
