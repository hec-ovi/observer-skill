#!/usr/bin/env node
/**
 * The one entry point. It reads the environment once, builds every box, and hands them to
 * whichever face the subcommand asks for.
 *
 * stdout belongs to the MCP protocol: in `mcp` mode nothing but protocol bytes go there, so
 * the page URL, the port and every diagnostic are written to stderr. `doctor` and `--help`
 * are human commands and print to stdout.
 */

import { readConfig } from '#config'
import { toErrorShape } from '#errors'
import type { Config } from '#config'
import { diagnose, report } from './doctor.ts'
import { usage } from './help.ts'
import { Shutdown } from './lifecycle.ts'
import { VERSION } from './paths.ts'
import { wire } from './wiring.ts'

type Command = 'mcp' | 'serve' | 'doctor' | 'help' | 'version'

const NAMED: Record<string, Command> = {
  mcp: 'mcp',
  serve: 'serve',
  doctor: 'doctor',
  help: 'help',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
  '-v': 'version',
}

/** An agent spawns this with a pipe on stdin; a person runs it in a terminal. */
function commandOf(argv: readonly string[]): Command | null {
  const first = argv[0]
  if (first === undefined) return process.stdin.isTTY === true ? 'help' : 'mcp'
  return NAMED[first] ?? null
}

/** MCP on stdio. The listener stays down until a session opens a page. */
async function mcp(config: Config): Promise<never> {
  const wiring = await wire(config)
  const shutdown = new Shutdown(wiring.close).onSignals()
  // `agent-io` reads stdin itself and returns when the client closes it, so nothing else here
  // may touch that stream. A signal gets there first or the stream does; either one ends it.
  await Promise.race([wiring.agentIo.serve(), shutdown.run()])
  return shutdown.now()
}

/** The page, listening now, for someone who wants it without an agent attached. */
async function serve(config: Config): Promise<never> {
  const wiring = await wire(config)
  const shutdown = new Shutdown(wiring.close).onSignals().onClosed(process.stdin)

  const { url, port } = await wiring.host.start()
  if (port !== config.port) {
    console.error(`[observer] port ${config.port} was taken, so the page is on ${port}.`)
  }
  console.error(`[observer] the page is at ${url}`)
  console.error('[observer] stop it with ctrl-c.')

  return shutdown.run()
}

async function run(command: Command, config: Config): Promise<number> {
  switch (command) {
    case 'help':
      process.stdout.write(usage())
      return 0
    case 'version':
      process.stdout.write(`${VERSION}\n`)
      return 0
    case 'doctor':
      return report(await diagnose(config), (line) => process.stdout.write(`${line}\n`))
    case 'serve':
      return serve(config)
    case 'mcp':
      return mcp(config)
  }
}

const argv = process.argv.slice(2)
const command = commandOf(argv)
if (command === null) {
  console.error(`[observer] no such command: ${argv[0]}`)
  console.error(usage())
  process.exit(2)
}

try {
  process.exitCode = await run(command, readConfig())
} catch (error) {
  const { message, hint } = toErrorShape(error)
  console.error(`[observer] ${command} could not run: ${message}`)
  console.error(`[observer] ${hint}`)
  process.exit(1)
}
