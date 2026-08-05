/**
 * What `observer --help` prints. The defaults come from `#config`, so the help cannot drift
 * away from what the process actually does when nothing is set.
 */

import { readConfig } from '#config'
import type { Config } from '#config'
import { VERSION } from './paths.ts'

interface Command {
  name: string
  detail: string
}

interface Variable {
  name: string
  /** The setting it fills in, so a renamed field fails the type check, not the reader. */
  key: keyof Config
  detail: string
}

const COMMANDS: readonly Command[] = [
  { name: 'mcp', detail: 'Speak MCP on stdin and stdout. The default when stdin is not a terminal.' },
  { name: 'serve', detail: 'Start the page server now and stay up, without an agent attached.' },
  { name: 'doctor', detail: 'Report what this machine can do and what to install to widen it.' },
  { name: '--help', detail: 'This text.' },
  { name: '--version', detail: 'Print the version.' },
]

const ENVIRONMENT: readonly Variable[] = [
  { name: 'OBSERVER_PORT', key: 'port', detail: 'First port to try for the page; a taken one moves up.' },
  { name: 'OBSERVER_BIND', key: 'bind', detail: 'Address to listen on.' },
  { name: 'OBSERVER_HOME', key: 'home', detail: 'Where sessions, transcripts and artifacts live.' },
  { name: 'OBSERVER_TRANSCRIPT', key: 'transcript', detail: 'Transcript provider: auto, captions, endpoint-asr, file.' },
  { name: 'OBSERVER_ASR_URL', key: 'asrUrl', detail: 'OpenAI-compatible transcription endpoint.' },
  { name: 'OBSERVER_ASR_KEY', key: 'asrKey', detail: 'Bearer token for that endpoint.' },
  { name: 'OBSERVER_ASR_MODEL', key: 'asrModel', detail: 'Model name that endpoint should use.' },
  { name: 'OBSERVER_OPEN', key: 'openBrowser', detail: 'Open the page in a browser when a session starts.' },
]

const NAME_WIDTH = 20

function shown(value: Config[keyof Config]): string {
  return value === null ? 'unset' : String(value)
}

export function usage(): string {
  // An empty environment, so every line reads as what happens with nothing set.
  const defaults = readConfig({})

  const commands = COMMANDS.map(
    (command) => `  ${command.name.padEnd(NAME_WIDTH)} ${command.detail}`,
  )
  const environment = ENVIRONMENT.map(
    (variable) =>
      `  ${variable.name.padEnd(NAME_WIDTH)} ${variable.detail} Default ${shown(defaults[variable.key])}.`,
  )

  return [
    `observer ${VERSION} — study a video or podcast with a coding agent.`,
    '',
    'Usage',
    '  observer [command]',
    '',
    'Commands',
    ...commands,
    '',
    'Environment',
    ...environment,
    '',
  ].join('\n')
}
