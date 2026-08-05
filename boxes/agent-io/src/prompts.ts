/**
 * The six prompts the agent works from. They are files, never string literals: this module
 * finds the directory, reads them once, and hands them to the client as MCP prompts.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { McpServer } from '@modelcontextprotocol/server'
import { fail } from '#errors'
import type { Runtime } from './runtime.ts'

export const PROMPT_NAMES = [
  'study-plan',
  'research',
  'visual-plan',
  'artifact-authoring',
  'session-answer',
  'ads',
] as const

/**
 * The prompts that run before the video does. `ads` is appended to these when the user said
 * the video carries sponsor reads, so the agent never has to remember to ask for it.
 */
const PREPARATION: readonly string[] = ['study-plan', 'research', 'visual-plan']

/**
 * `../prompts/` is the source layout, `./prompts/` the published one. A directory the
 * process was configured with wins over both, for an install that keeps them elsewhere.
 */
function promptsDir(declared: string | null): string {
  if (declared !== null) return declared

  const candidates = ['../prompts/', './prompts/'].map((relative) =>
    fileURLToPath(new URL(relative, import.meta.url)),
  )
  const found = candidates.find((candidate) => existsSync(candidate))
  if (found === undefined) {
    fail(
      'INTERNAL',
      `No prompts directory at ${candidates.join(' or ')}.`,
      'Reinstall the package, or set OBSERVER_PROMPTS to the prompts folder.',
    )
  }
  return found
}

/** The name, the text, and the one-line title its own heading gives it. */
export interface PromptFile {
  name: string
  text: string
  description: string
}

function headingOf(text: string): string {
  const first = text.split('\n', 1)[0] ?? ''
  return first.replace(/^#+\s*/, '').trim()
}

export function loadPrompts(declared: string | null = null): PromptFile[] {
  const dir = promptsDir(declared)
  return PROMPT_NAMES.map((name) => {
    const file = join(dir, `${name}.md`)
    if (!existsSync(file)) {
      fail('INTERNAL', `Prompt file ${file} is missing.`, 'Reinstall the package.')
    }
    const text = readFileSync(file, 'utf8')
    return { name, text, description: headingOf(text) }
  })
}

export function registerPrompts(
  server: McpServer,
  runtime: Runtime,
  prompts: readonly PromptFile[],
): void {
  const ads = prompts.find((prompt) => prompt.name === 'ads')

  for (const prompt of prompts) {
    server.registerPrompt(prompt.name, { description: prompt.description }, () => {
      const appended =
        ads !== undefined && PREPARATION.includes(prompt.name) && hasAds(runtime)
          ? `${prompt.text}\n\n---\n\n${ads.text}`
          : prompt.text
      return {
        description: prompt.description,
        messages: [{ role: 'user' as const, content: { type: 'text' as const, text: appended } }],
      }
    })
  }
}

function hasAds(runtime: Runtime): boolean {
  const newest = runtime.deps.store.list()[0]
  return newest?.source.hasAds ?? false
}
