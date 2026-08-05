import { test } from 'node:test'
import assert from 'node:assert/strict'
import { x } from './fixtures.ts'
test('uses fixture', () => { assert.equal(x, 1) })
