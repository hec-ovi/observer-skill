#!/usr/bin/env node
/**
 * The publish build.
 *
 * Development runs the TypeScript directly: `node bin/observer.ts`. That stops working the
 * moment npm copies the package into someone's node_modules, where Node refuses to strip
 * types. So publishing emits JavaScript:
 *
 *   dist/observer.js   the CLI and everything it imports, one file
 *   dist/prompts/      the prompt files agent-io reads at runtime
 *   dist/app/          the built page, served by web-host
 */

import { build } from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

const ROOT = join(import.meta.dirname, '..')
const DIST = join(ROOT, 'dist')

async function buildServer(): Promise<void> {
  const result = await build({
    entryPoints: [join(ROOT, 'bin', 'observer.ts')],
    outfile: join(DIST, 'observer.js'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    // Everything under boxes/ and shared/ is ours and gets bundled; npm packages stay
    // external so the install resolves them normally.
    packages: 'external',
    sourcemap: true,
    banner: { js: '#!/usr/bin/env node' },
    logLevel: 'silent',
  })
  for (const warning of result.warnings) {
    console.error(`[build] ${warning.text}`)
  }
}

async function buildApp(): Promise<void> {
  await run('npx', ['vite', 'build'], { cwd: ROOT, encoding: 'utf8', timeout: 300_000 })
  // The three libraries an artifact may import are built after the app, into its output,
  // so the page and the verify frame resolve the same modules through one import map.
  await run(
    'npx',
    ['vite', 'build', '--config', 'boxes/app/stage/vendor/vite.config.ts'],
    { cwd: ROOT, encoding: 'utf8', timeout: 300_000 },
  )
}

await rm(DIST, { recursive: true, force: true })
await mkdir(DIST, { recursive: true })

await buildServer()
await cp(join(ROOT, 'boxes', 'agent-io', 'prompts'), join(DIST, 'prompts'), { recursive: true })
await buildApp()

console.error('built dist/observer.js, dist/prompts, dist/app')
