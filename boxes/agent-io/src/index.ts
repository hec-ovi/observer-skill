/**
 * agent-io: the agent's whole face onto Observer. The MCP server on stdio, its tools, its
 * prompts, and the phase rules that keep a session moving in one direction. See CONTRACT.md.
 */

import { loadPrompts } from './prompts.ts'
import type { AgentIoDeps } from './ports.ts'
import { Runtime } from './runtime.ts'
import { serveOnStdio } from './serve.ts'

export type {
  AgentIoConfig,
  AgentIoDeps,
  ArtifactPort,
  HostPort,
  IngestPort,
  TranscriptPort,
} from './ports.ts'

export interface AgentIo {
  /** Speaks MCP on stdin and stdout until the stream closes, then shuts down. */
  serve(): Promise<void>
}

export function createAgentIo(deps: AgentIoDeps): AgentIo {
  const runtime = new Runtime(deps)
  // Read once, at startup: a missing prompt file is a broken install and should say so
  // before the first tool call, not during one.
  const prompts = loadPrompts()

  return {
    serve: () => serveOnStdio(runtime, prompts),
  }
}
