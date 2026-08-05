#!/usr/bin/env node
/**
 * One canonical skill, three places that need a copy.
 *
 *   skills/observer/          canonical, the only one to edit
 *   ./                        root SKILL.md + references/, for a plain checkout
 *   plugins/observer/skills/  the Claude plugin
 *
 * Plus the prompt files, which live with the server in boxes/agent-io/prompts/ and are
 * copied into the skill's references/. An agent following SKILL.md reads files by path, so
 * a prompt it is told to read has to be one of them.
 *
 * Run with --check to fail on drift instead of writing.
 */

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
export const PROMPTS = join(ROOT, 'boxes', 'agent-io', 'prompts')
export const CANONICAL = join(ROOT, 'skills', 'observer')
export const COPIES = [ROOT, join(ROOT, 'plugins', 'observer', 'skills', 'observer')]

/** The one prompt whose copy takes another name: SKILL.md and the docs say `artifacts.md`. */
const RENAMED: Record<string, string> = { 'artifact-authoring.md': 'artifacts.md' }

/** A prompt file and the name its copy carries under references/. */
interface PromptCopy {
  source: string
  reference: string
}

async function promptCopies(): Promise<PromptCopy[]> {
  const names = (await readdir(PROMPTS)).filter((name) => name.endsWith('.md')).sort()
  return names.map((name) => ({ source: join(PROMPTS, name), reference: RENAMED[name] ?? name }))
}

/** Writes the copies, or with `check` collects the paths that would have changed. */
class Sync {
  readonly drift: string[] = []
  readonly #check: boolean

  constructor(check: boolean) {
    this.#check = check
  }

  async #file(path: string, content: string): Promise<void> {
    const current = await readFile(path, 'utf8').catch(() => null)
    if (current === content) return
    if (this.#check) {
      this.drift.push(path)
      return
    }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  }

  async #tree(from: string, to: string): Promise<void> {
    for (const entry of await readdir(from, { withFileTypes: true })) {
      const source = join(from, entry.name)
      const target = join(to, entry.name)
      if (entry.isDirectory()) {
        await this.#tree(source, target)
        continue
      }
      await this.#file(target, await readFile(source, 'utf8'))
    }
  }

  async run(): Promise<void> {
    for (const { source, reference } of await promptCopies()) {
      await this.#file(join(CANONICAL, 'references', reference), await readFile(source, 'utf8'))
    }
    for (const copy of COPIES) {
      if (!this.#check) await rm(join(copy, 'references'), { recursive: true, force: true })
      await this.#tree(CANONICAL, copy)
    }
  }
}

/** Returns the paths that are out of date, which is empty unless `check` is on. */
export async function syncSkillCopies(check = false): Promise<string[]> {
  const sync = new Sync(check)
  await sync.run()
  return sync.drift
}

if (import.meta.main) {
  const check = process.argv.includes('--check')
  const drift = await syncSkillCopies(check)
  if (drift.length > 0) {
    console.error('Skill copies are out of date:')
    for (const path of drift) console.error(`  ${path.slice(ROOT.length + 1)}`)
    console.error('Run: node scripts/sync-skill-copies.ts')
    process.exit(1)
  }
  if (!check) console.error(`synced skills/observer -> ${COPIES.length} copies`)
}
