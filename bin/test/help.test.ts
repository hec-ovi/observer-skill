/**
 * `--help` is the only place a person is told what this process reads from the environment,
 * so the table it prints is checked against `Config` itself: a setting added without a line
 * here is a setting nobody can find.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { readConfig } from '#config'
import type { Config } from '#config'
import { ENVIRONMENT, usage } from '../help.ts'

describe('observer --help', () => {
  it('documents every setting the process reads, and names each variable', () => {
    const printed = usage()
    const settings = Object.keys(readConfig({})) as (keyof Config)[]

    assert.deepEqual(
      ENVIRONMENT.map((variable) => variable.key).sort(),
      settings.sort(),
    )
    for (const variable of ENVIRONMENT) {
      assert.ok(printed.includes(variable.name), `${variable.name} is not in the help`)
    }
  })
})
