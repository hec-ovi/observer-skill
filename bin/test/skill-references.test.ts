/**
 * The skill is a set of files the agent reads by path. A prompt with no copy under
 * references/, a reference nothing links to, or an error code missing from the table is a
 * dead end the agent only discovers mid-session, so each one fails here instead.
 */

import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { ERROR_CODES } from '#errors'
import { CANONICAL, COPIES, PROMPTS, syncSkillCopies } from '../../scripts/sync-skill-copies.ts'

const REFERENCES = join(CANONICAL, 'references')

/** The sync runs first, so this proves the script covers the prompts, not that someone ran it. */
async function synced(): Promise<void> {
  const drift = await syncSkillCopies()
  assert.deepEqual(drift, [], 'a write run reported drift')
}

/** Every reference a skill ships, read as text: the copy's name is the script's business. */
async function referenceTexts(skill: string): Promise<Set<string>> {
  const dir = join(skill, 'references')
  const names = await readdir(dir)
  return new Set(await Promise.all(names.map((name) => readFile(join(dir, name), 'utf8'))))
}

describe('skill references', () => {
  it('gives every prompt a copy in the skill and in each published copy', async () => {
    await synced()
    const prompts = (await readdir(PROMPTS)).filter((name) => name.endsWith('.md'))
    assert.ok(prompts.length > 0, 'no prompt files found')

    for (const skill of [CANONICAL, ...COPIES]) {
      const shipped = await referenceTexts(skill)
      for (const name of prompts) {
        const prompt = await readFile(join(PROMPTS, name), 'utf8')
        assert.ok(shipped.has(prompt), `${name} has no copy under ${skill}/references`)
      }
    }
  })

  it('links every reference it ships from SKILL.md', async () => {
    await synced()
    const skill = await readFile(join(CANONICAL, 'SKILL.md'), 'utf8')

    for (const name of await readdir(REFERENCES)) {
      assert.ok(
        skill.includes(`(references/${name})`),
        `SKILL.md ships references/${name} and never links it`,
      )
    }
  })

  it('documents the whole closed error set, which is what errors.md claims', async () => {
    const table = await readFile(join(REFERENCES, 'errors.md'), 'utf8')
    const documented = [...table.matchAll(/^\| `([A-Z_]+)` \|/gm)].map((match) => match[1])

    assert.deepEqual([...documented].sort(), [...ERROR_CODES].sort())
  })
})
