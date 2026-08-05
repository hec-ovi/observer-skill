/**
 * Every promise the contract makes, through `build`: a good module bundles, each check
 * refuses what it exists to refuse, and every refusal points at the line the agent wrote.
 */

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { build, type BuildError, type BuildResult } from '#artifact'
import { ObserverError } from '#errors'

let home = ''

before(async () => {
  home = await mkdtemp(join(tmpdir(), 'observer-artifact-'))
})

after(async () => {
  await rm(home, { recursive: true, force: true })
})

function fixture(name: string): Promise<string> {
  return readFile(join(import.meta.dirname, 'fixtures', `${name}.txt`), 'utf8')
}

async function buildFixture(name: string, id = name): Promise<{ source: string; result: BuildResult }> {
  const source = await fixture(name)
  return { source, result: await build({ sessionId: 'session-1', id, source, home }) }
}

function errorsOf(result: BuildResult): BuildError[] {
  assert.equal(result.ok, false, 'expected the build to fail')
  return result.errors
}

/** Proves both numbers at once: the reported position lands on `needle` in the source. */
function assertPointsAt(source: string, error: BuildError, needle: string): void {
  const line = source.split('\n')[(error.line ?? 0) - 1] ?? ''
  const from = line.slice((error.column ?? 1) - 1)
  assert.ok(
    from.startsWith(needle),
    `expected ${error.line}:${error.column} to point at "${needle}", found "${from.slice(0, 40)}"`,
  )
}

test('a good module bundles to an ESM file with the registry left external', async () => {
  const { result } = await buildFixture('good-chart')
  assert.equal(result.ok, true)
  if (!result.ok) return

  assert.equal(result.bundlePath, join(home, 'artifacts', 'session-1', 'good-chart.js'))
  assert.deepEqual(result.warnings, [])

  const bundle = await readFile(result.bundlePath, 'utf8')
  assert.equal(Buffer.byteLength(bundle), result.bytes)
  assert.match(bundle, /from "echarts"/)
  assert.match(bundle, /export\s*\{/)
  assert.match(bundle, /sourceMappingURL=data:application\/json;base64,/)
})

test('rebuilding the same id replaces the bundle at the same path', async () => {
  const first = await buildFixture('good-chart', 'stable-id')
  const second = await buildFixture('good-chart', 'stable-id')
  assert.equal(first.result.ok && second.result.ok, true)
  if (!first.result.ok || !second.result.ok) return
  assert.equal(second.result.bundlePath, first.result.bundlePath)
  assert.equal(second.result.bytes, first.result.bytes)
})

test('an import outside the registry fails the check and writes nothing', async () => {
  const { source, result } = await buildFixture('bad-import')
  const errors = errorsOf(result)
  const error = errors[0]
  assert.ok(error)
  assert.equal(error.stage, 'check')
  assert.match(error.message, /lodash/)
  assert.match(error.fix ?? '', /echarts, d3, katex/)
  assert.ok(error.snippet?.includes('^'))
  assertPointsAt(source, error, 'lodash')

  await assert.rejects(stat(join(home, 'artifacts', 'session-1', 'bad-import.js')))
})

test('reaching the network fails the check', async () => {
  const { source, result } = await buildFixture('network-fetch')
  const errors = errorsOf(result)
  const error = errors[0]
  assert.ok(error)
  assert.match(error.message, /fetch is not allowed/)
  assertPointsAt(source, error, 'fetch(')
})

test('a non-zero border-radius fails, in CSS text and in chart options', async () => {
  const { source, result } = await buildFixture('rounded-corner')
  const errors = errorsOf(result)
  assert.equal(errors.length, 2)

  const [css, option] = errors
  assert.ok(css && option)
  assertPointsAt(source, css, 'border-radius: 4px')
  assert.match(css.fix ?? '', /border-radius: 0/)
  assertPointsAt(source, option, 'borderRadius')
  assert.match(option.fix ?? '', /Set borderRadius to 0/)
})

test('a heading repeating meta.title fails', async () => {
  const { source, result } = await buildFixture('repeats-title')
  const errors = errorsOf(result)
  const error = errors[0]
  assert.ok(error)
  assert.match(error.message, /repeats meta\.title/)
  assertPointsAt(source, error, 'Share of traffic</h2>')
})

test('a module without mount fails, naming what to export', async () => {
  const { result } = await buildFixture('no-mount')
  const errors = errorsOf(result)
  const error = errors[0]
  assert.ok(error)
  assert.match(error.message, /mount is not exported/)
  assert.match(error.fix ?? '', /export function mount\(el, ctx\)/)
})

test('a syntax error reports the line it is on', async () => {
  const { source, result } = await buildFixture('broken-syntax')
  const errors = errorsOf(result)
  const error = errors[0]
  assert.ok(error)
  assert.equal(error.stage, 'check')
  assert.equal(error.line, 11)
  assert.equal(source.split('\n')[10], '  echarts.init(el).setOption(option)')
  assert.ok(error.fix)
})

test('a bundle over the size limit is refused and nothing is written', async () => {
  const padding = 'x'.repeat(1_600_000)
  const source = [
    "export const meta = { title: 'Huge', kind: 'dataviz' }",
    `const rows = '${padding}'`,
    'export function mount(el) { el.textContent = String(rows.length); return () => {} }',
  ].join('\n')

  await assert.rejects(
    build({ sessionId: 'session-1', id: 'huge', source, home }),
    (error: unknown) => error instanceof ObserverError && error.code === 'ARTIFACT_TOO_LARGE',
  )
  await assert.rejects(stat(join(home, 'artifacts', 'session-1', 'huge.js')))
})

test('a home that cannot be written to fails with STORE_UNWRITABLE', async () => {
  const blocked = join(home, 'not-a-directory')
  await writeFile(blocked, 'in the way')
  const source = await fixture('good-chart')

  await assert.rejects(
    build({ sessionId: 'session-1', id: 'blocked', source, home: blocked }),
    (error: unknown) => error instanceof ObserverError && error.code === 'STORE_UNWRITABLE',
  )
})
