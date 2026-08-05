import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test } from 'node:test'
import { createHost } from '../src/index.ts'
import { FakeStore, makeAppDir, makeHome, openSse, startHost } from '../fixtures.ts'

test('nothing listens until the host is started', async () => {
  const host = await createHost({
    store: new FakeStore(),
    appDir: await makeAppDir(),
    home: await makeHome(),
    port: 0,
  })
  assert.equal(host.url, null)
  assert.equal(host.port, null)

  const { url, port } = await host.start()
  assert.equal(host.url, url)
  assert.equal(host.port, port)
  await host.close()
})

test('a taken port moves up one, and the host reports the one it got', async () => {
  const squatter = createServer()
  squatter.listen(0, '127.0.0.1')
  await once(squatter, 'listening')
  const address = squatter.address()
  assert.ok(address !== null && typeof address === 'object')
  const taken = address.port

  const host = await createHost({
    store: new FakeStore(),
    appDir: await makeAppDir(),
    home: await makeHome(),
    port: taken,
  })
  try {
    const { port, url } = await host.start()
    assert.equal(port, taken + 1)
    assert.equal(url, `http://127.0.0.1:${taken + 1}`)
  } finally {
    await host.close()
    squatter.close()
  }
})

test('closing while the bind is in flight leaves nothing listening', async () => {
  const host = await createHost({
    store: new FakeStore(),
    appDir: await makeAppDir(),
    home: await makeHome(),
    port: 0,
  })

  const starting = host.start()
  await host.close()
  const { url } = await starting

  assert.equal(host.url, null)
  assert.equal(host.port, null)
  await assert.rejects(() => fetch(`${url}/healthz`))
})

test('close returns with a stream still attached', async () => {
  const running = await startHost()
  const client = await openSse(`${running.base}/live/s1`)
  await running.store.patch('s1', { position: { time: 5, state: 'playing' } })
  await client.waitFor('patch')

  const started = Date.now()
  await running.host.close()
  assert.ok(Date.now() - started < 2_000, 'close waited on the open stream')

  await assert.rejects(() => fetch(`${running.base}/healthz`))
})
