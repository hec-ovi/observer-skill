import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { FakeStore, makeArtifact, makeSession, startHost } from '../fixtures.ts'
import { inlineScripts, scriptHash } from '../src/sandbox-document.ts'

/** One pixel, so the snapshot route serves real image bytes. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const store = new FakeStore([
  makeSession({
    artifacts: [
      makeArtifact(),
      makeArtifact({ id: 'a2', snapshotPath: 'sessions/s1/artifacts/a2.png' }),
    ],
  }),
])
const running = await startHost({ store, version: '1.2.3' })
after(() => running.stop())

test('healthz reports the version', async () => {
  const answer = await fetch(`${running.base}/healthz`)
  assert.equal(answer.status, 200)
  assert.deepEqual(await answer.json(), { ok: true, version: '1.2.3' })
})

test('the record is served once, over REST', async () => {
  const answer = await fetch(`${running.base}/api/session/s1`)
  assert.equal(answer.status, 200)
  assert.equal(((await answer.json()) as { id: string }).id, 's1')
})

test('an unknown session is the shared 404', async () => {
  const answer = await fetch(`${running.base}/api/session/nope`)
  assert.equal(answer.status, 404)
  const body = (await answer.json()) as { code: string; hint: string }
  assert.equal(body.code, 'UNKNOWN_SESSION')
  assert.ok(body.hint.length > 0)
})

test('a deep link into a session serves the app shell', async () => {
  const answer = await fetch(`${running.base}/s/s1`)
  assert.equal(answer.status, 200)
  assert.match(answer.headers.get('content-type') ?? '', /text\/html/)
  assert.match(await answer.text(), /<div id="app">/)
})

test('a missing hashed asset is a 404, never the shell', async () => {
  const answer = await fetch(`${running.base}/assets/app-deadbeef.js`)
  assert.equal(answer.status, 404)
  assert.doesNotMatch(answer.headers.get('content-type') ?? '', /text\/html/)
})

test('an artifact bundle is served as a module the sandbox can import', async () => {
  const answer = await fetch(`${running.base}/api/artifact/s1/a1`)
  assert.equal(answer.status, 200)
  assert.match(answer.headers.get('content-type') ?? '', /text\/javascript/)
  assert.equal(answer.headers.get('access-control-allow-origin'), '*')
  assert.equal(await answer.text(), 'export const chart = 1\n')
})

test('an artifact whose path climbs out of the session is refused', async () => {
  // The file exists and is readable, so only the containment check can answer 404.
  await mkdir(join(running.home, 'sessions', 'other'), { recursive: true })
  await writeFile(join(running.home, 'sessions', 'other', 'secret.js'), 'export const secret = 1\n')

  const escaped = new FakeStore([
    makeSession({ artifacts: [makeArtifact({ bundlePath: 'sessions/other/secret.js' })] }),
  ])
  const other = await startHost({ store: escaped, home: running.home, appDir: running.appDir })
  try {
    const answer = await fetch(`${other.base}/api/artifact/s1/a1`)
    assert.equal(answer.status, 404)
    assert.equal(((await answer.json()) as { code: string }).code, 'UNKNOWN_ARTIFACT')
  } finally {
    await other.stop()
  }
})

test('the snapshot the agent looked at is served as a PNG', async () => {
  await writeFile(join(running.home, 'sessions', 's1', 'artifacts', 'a2.png'), PNG)

  const answer = await fetch(`${running.base}/api/snapshot/s1/a2`)
  assert.equal(answer.status, 200)
  assert.match(answer.headers.get('content-type') ?? '', /image\/png/)
  assert.deepEqual(Buffer.from(await answer.arrayBuffer()), PNG)
})

test('an artifact with no snapshot says so instead of serving nothing', async () => {
  const answer = await fetch(`${running.base}/api/snapshot/s1/a1`)
  assert.equal(answer.status, 404)
  const body = (await answer.json()) as { code: string; message: string; hint: string }
  assert.equal(body.code, 'UNKNOWN_ARTIFACT')
  // Not the catch-all 404: the route names the artifact and what is missing from it.
  assert.match(body.message, /a1 has no snapshot/)
  assert.ok(body.hint.length > 0)
})

test('the verify frame is served under its own policy', async () => {
  const answer = await fetch(`${running.base}/sandbox/frame`)
  assert.equal(answer.status, 200)

  const policy = answer.headers.get('content-security-policy') ?? ''
  assert.match(policy, /default-src 'none'/)
  assert.match(policy, /connect-src 'none'/)
  assert.match(policy, /sandbox allow-scripts/)
  assert.ok(
    policy.includes(
      `script-src ${running.base}/sandbox/ ${running.base}/assets/ ${running.base}/api/artifact/`,
    ),
  )
  assert.equal(answer.headers.get('x-content-type-options'), 'nosniff')

  // The document is the app build's own, so the stage's loader runs the module.
  assert.match(await answer.text(), /<script type="module"/)
})

test('the policy carries a hash for every inline script the frame ships', async () => {
  // The import map is inline and has no other spelling. A policy that does not name it
  // blocks it, every artifact fails to resolve its library, and the toolkit is dead.
  const answer = await fetch(`${running.base}/sandbox/frame`)
  const policy = answer.headers.get('content-security-policy') ?? ''
  const html = await answer.text()

  const bodies = inlineScripts(html)
  assert.ok(bodies.length > 0, 'the fixture frame has no inline script to protect')
  for (const body of bodies) {
    assert.ok(policy.includes(scriptHash(body)), `no hash in script-src for: ${body.slice(0, 60)}`)
  }
})

test('the policy follows the document when the build changes', async () => {
  const before = await fetch(`${running.base}/sandbox/frame`)
  const beforePolicy = before.headers.get('content-security-policy') ?? ''

  await writeFile(
    join(running.appDir, 'sandbox.html'),
    '<!doctype html><title>verify</title><script>window.rebuilt = 1</script>',
  )

  const after = await fetch(`${running.base}/sandbox/frame`)
  const afterPolicy = after.headers.get('content-security-policy') ?? ''
  assert.notEqual(afterPolicy, beforePolicy)
  assert.ok(afterPolicy.includes(scriptHash('window.rebuilt = 1')))
})

test('the verify document has no second address that skips the policy', async () => {
  // Every spelling serve-static would resolve to the same file, since it decodes and
  // normalizes before it reads.
  const spellings = [
    '/sandbox.html',
    '/%73andbox.html',
    '//sandbox.html',
    '/./sandbox.html',
    '/a/../sandbox.html',
    '/sandbox.html?x=1',
  ]
  for (const path of spellings) {
    const answer = await fetch(`${running.base}${path}`)
    assert.equal(answer.status, 404, `${path} was served`)
    assert.equal(((await answer.json()) as { code: string }).code, 'UNKNOWN_ARTIFACT')
  }
})

test('the registry modules are served with the CORS header a module fetch needs', async () => {
  const answer = await fetch(`${running.base}/sandbox/vendor/echarts.js`)
  assert.equal(answer.status, 200)
  assert.equal(answer.headers.get('access-control-allow-origin'), '*')
})

test('a 404 from a static layer names no path on this disk', async () => {
  for (const path of ['/assets/app-deadbeef.js', '/sandbox/vendor/nope.js']) {
    const answer = await fetch(`${running.base}${path}`)
    assert.equal(answer.status, 404)
    const body = (await answer.json()) as { code: string; message: string; hint: string }
    assert.equal(body.code, 'UNKNOWN_ARTIFACT')
    assert.doesNotMatch(body.message, /ENOENT/)
    assert.ok(!body.message.includes(running.appDir), `${path} leaked ${running.appDir}`)
    assert.ok(body.hint.length > 0)
  }
})
