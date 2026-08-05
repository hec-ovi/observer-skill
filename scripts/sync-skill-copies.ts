#!/usr/bin/env node
/**
 * One canonical skill, three places that need a copy.
 *
 *   skills/observer/          canonical, the only one to edit
 *   ./                        root SKILL.md + references/, for a plain checkout
 *   plugins/observer/skills/  the Claude plugin
 *
 * Plus one file that lives with the prompts and is served both as an MCP prompt and as a
 * skill reference: boxes/agent-io/prompts/artifact-authoring.md -> references/artifacts.md
 *
 * Run with --check to fail on drift instead of writing.
 */

import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const CANONICAL = join(ROOT, 'skills', 'observer')
const AUTHORING = join(ROOT, 'boxes', 'agent-io', 'prompts', 'artifact-authoring.md')

const COPIES = [ROOT, join(ROOT, 'plugins', 'observer', 'skills', 'observer')]

const check = process.argv.includes('--check')
const drift: string[] = []

async function sameOrRecord(path: string, content: string): Promise<void> {
  const current = await readFile(path, 'utf8').catch(() => null)
  if (current === content) return
  if (check) {
    drift.push(path)
    return
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
}

async function syncTree(from: string, to: string): Promise<void> {
  const entries = await readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (entry.isDirectory()) {
      await syncTree(source, target)
      continue
    }
    await sameOrRecord(target, await readFile(source, 'utf8'))
  }
}

// The authoring guide is written once, next to the other prompts, and lands in the skill.
await sameOrRecord(join(CANONICAL, 'references', 'artifacts.md'), await readFile(AUTHORING, 'utf8'))

for (const copy of COPIES) {
  if (!check) await rm(join(copy, 'references'), { recursive: true, force: true })
  await syncTree(CANONICAL, copy)
}

if (check && drift.length > 0) {
  console.error('Skill copies are out of date:')
  for (const path of drift) console.error(`  ${path.slice(ROOT.length + 1)}`)
  console.error('Run: node scripts/sync-skill-copies.ts')
  process.exit(1)
}

if (!check) console.error(`synced skills/observer -> ${COPIES.length} copies`)
