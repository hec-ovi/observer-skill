import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { FakeStore, makeArtifact, makeSession, startHost } from '../fixtures.ts'

const store = new FakeStore([makeSession({ artifacts: [makeArtifact()] })])
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

test('the registry modules are served with the CORS header a module fetch needs', async () => {
  const answer = await fetch(`${running.base}/sandbox/vendor/echarts.js`)
  assert.equal(answer.status, 200)
  assert.equal(answer.headers.get('access-control-allow-origin'), '*')
})
