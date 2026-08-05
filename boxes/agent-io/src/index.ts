/**
 * agent-io: the agent's whole face onto Observer. The MCP server on stdio, its tools, its
 * prompts, and the phase rules that keep a session moving in one direction. See CONTRACT.md.
 */

import { agentIoOn } from './api.ts'
import type { AgentIo } from './api.ts'
import type { AgentIoDeps } from './ports.ts'
import { loadPrompts } from './prompts.ts'
import { Runtime } from './runtime.ts'

export type { AgentIo } from './api.ts'
export type { OpenSessionInput } from './open-session.ts'
export type {
  AgentIoConfig,
  AgentIoDeps,
  ArtifactPort,
  HostPort,
  IngestPort,
  TranscriptPort,
} from './ports.ts'

export function createAgentIo(deps: AgentIoDeps): AgentIo {
  // Prompts are read once, at startup: a missing prompt file is a broken install and should
  // say so before the first tool call, not during one.
  return agentIoOn(new Runtime(deps), loadPrompts(deps.config.prompts ?? null))
}
