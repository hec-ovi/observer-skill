/**
 * The client caps a tool result, so a three-hour transcript is read a page at a time and
 * every page is sized to fit. Anything that grows with the video is proven here.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { RESULT_BUDGET_CHARS, sizeOf } from '../src/budget.ts'
import { openAgentIo, openSession } from '../fixtures.ts'

interface Page {
  segments: { i: number }[]
  offset: number
  total: number
  nextOffset?: number
}

describe('transcript paging', () => {
  it('fits one page in a result and carries a cursor to the next', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)

    const first = (await harness.call('transcript')).body as unknown as Page

    assert.equal(first.total, 360)
    assert.equal(first.offset, 0)
    assert.ok(first.segments.length < first.total, 'the whole transcript does not fit one result')
    assert.equal(first.nextOffset, first.segments.length)
    assert.ok(sizeOf(first.segments) <= RESULT_BUDGET_CHARS)
  })

  it('reads a three-hour transcript end to end, every segment once, in order', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)

    const read: number[] = []
    let offset: number | undefined = 0
    let pages = 0

    while (offset !== undefined) {
      const page = (await harness.call('transcript', { offset })).body as unknown as Page
      assert.ok(sizeOf(page) <= RESULT_BUDGET_CHARS * 1.1, 'every page stays inside the budget')
      assert.equal(page.offset, offset)
      read.push(...page.segments.map((segment) => segment.i))
      offset = page.nextOffset
      pages += 1
    }

    assert.ok(pages > 1, 'a long transcript takes more than one page')
    assert.deepEqual(read, Array.from({ length: 360 }, (_, i) => i))
  })

  it('trims a limit that would not fit, and continues from where it stopped', async (t) => {
    const harness = await openAgentIo(t)
    await openSession(harness)

    const page = (await harness.call('transcript', { limit: 360 })).body as unknown as Page

    assert.ok(page.segments.length < 360)
    assert.ok(sizeOf(page.segments) <= RESULT_BUDGET_CHARS)
    assert.equal(page.nextOffset, page.segments.length)
  })
})
