/**
 * The published CLI is JavaScript, and nothing else in the suite ever runs it: every other
 * test runs the TypeScript directly. So the one thing proven here is that the emitted file
 * starts.
 */

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { buildServer } from '../../scripts/build.ts'

const run = promisify(execFile)

describe('the published CLI', () => {
  it('runs, which a double shebang or a missing dependency would stop', async () => {
    // Inside the repo, because `packages: 'external'` means the bundle resolves its
    // dependencies from the install it sits in, exactly as a published package does.
    const root = fileURLToPath(new URL('../..', import.meta.url))
    const dist = await mkdtemp(join(root, '.dist-test-'))
    after(() => rm(dist, { recursive: true, force: true }))

    const bundle = await buildServer(dist)
    const { stdout } = await run(process.execPath, [bundle, '--version'], { encoding: 'utf8' })
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/)
  })
})
