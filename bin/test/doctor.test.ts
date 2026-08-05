import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { readConfig } from '#config'
import { diagnose, report } from '../doctor.ts'
import type { Check } from '../doctor.ts'

async function config() {
  const home = await mkdtemp(join(tmpdir(), 'observer-doctor-'))
  return { ...readConfig({}), home }
}

describe('doctor', () => {
  it('reports on everything a machine needs, whether or not it has it', async () => {
    const checks = await diagnose(await config())
    assert.deepEqual(
      checks.map((c) => c.name),
      ['node', 'data directory', 'port', 'yt-dlp', 'ffmpeg', 'speech recognition'],
    )
    for (const check of checks) {
      assert.ok(check.detail.length > 0, `${check.name} said nothing`)
      if (check.level !== 'ok') assert.ok(check.fix, `${check.name} is a problem with no fix`)
    }
  })

  it('says a directory it cannot write is broken', async () => {
    const checks = await diagnose({ ...(await config()), home: '/proc/observer' })
    const home = checks.find((c) => c.name === 'data directory')
    assert.equal(home?.level, 'broken')
  })

  it('exits non-zero only when something is actually broken', () => {
    const lines: string[] = []
    const gap: Check[] = [{ name: 'yt-dlp', level: 'gap', detail: 'missing', fix: 'install it' }]
    assert.equal(report(gap, (l) => lines.push(l)), 0)
    assert.ok(lines.some((l) => l.includes('install it')))

    const broken: Check[] = [{ name: 'node', level: 'broken', detail: 'too old', fix: 'upgrade' }]
    assert.equal(report(broken, () => {}), 1)
  })
})
