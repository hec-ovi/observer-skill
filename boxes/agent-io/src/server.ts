/**
 * The MCP server itself: every tool registered with its own schemas, every prompt file
 * registered as a prompt. One of these is built per connection; the runtime behind it is
 * shared by all of them.
 */

import { McpServer } from '@modelcontextprotocol/server'
import { dispatch } from './dispatch.ts'
import type { PromptFile } from './prompts.ts'
import { registerPrompts } from './prompts.ts'
import type { Runtime } from './runtime.ts'
import { phaseSchema } from './schema.ts'
import { TOOLS } from './tools/registry.ts'

const NAME = 'observer'

export function createServer(runtime: Runtime, prompts: readonly PromptFile[]): McpServer {
  const server = new McpServer(
    { name: NAME, version: runtime.deps.config.version ?? '0.0.0' },
    { capabilities: { tools: {}, prompts: {} } },
  )

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        // Every result carries the phase it left the session in, so the phase belongs to
        // the declared shape rather than to the body each tool returns.
        outputSchema: tool.output.extend({ phase: phaseSchema }),
      },
      (args, ctx) => dispatch(runtime, tool, args, ctx),
    )
  }

  registerPrompts(server, runtime, prompts)
  return server
}
