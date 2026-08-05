/**
 * The rail: following playback, letting go when the user takes over, and drawing three hours
 * of transcript from a window.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FakeResizeObserver } from '../../testing/fakes.ts'
import { TranscriptRail } from '../src/index.ts'
import type { Segment } from '../src/types.ts'
import { SEGMENTS_3H, transcriptOf } from './fixtures.ts'

/** A viewport the size of a real rail, which is what decides how many rows exist. */
function sizeViewport(): void {
  act(() => FakeResizeObserver.last().resize(360, 600))
}

function rail(segments: readonly Segment[], time: number, state: string) {
  return <TranscriptRail segments={segments} position={{ time, state }} onSeek={vi.fn()} />
}

/** Where a row was laid out, which is the only place its height shows. */
function topOf(row: Element | undefined): number {
  const transform = (row as HTMLElement | undefined)?.style.transform ?? ''
  return Number.parseFloat(/translateY\((-?[\d.]+)px\)/.exec(transform)?.[1] ?? 'NaN')
}

describe('TranscriptRail', () => {
  it('seeks to the line that was clicked', async () => {
    const user = userEvent.setup()
    const onSeek = vi.fn()
    render(
      <TranscriptRail
        segments={transcriptOf(20)}
        position={{ time: 0, state: 'paused' }}
        onSeek={onSeek}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Sentence 3\./ }))

    expect(onSeek).toHaveBeenCalledWith(6)
  })

  it('follows playback until the user scrolls, and follows again on play', () => {
    const segments = transcriptOf(SEGMENTS_3H)
    const { container, rerender } = render(rail(segments, 0, 'playing'))
    const viewport = container.firstElementChild as HTMLElement
    sizeViewport()

    rerender(rail(segments, 4000, 'playing'))
    expect(screen.getByRole('button', { current: true })).toHaveTextContent('Sentence 2000.')

    // The user pauses and scrolls back to read something.
    rerender(rail(segments, 4000, 'paused'))
    viewport.scrollTop = 0
    fireEvent.scroll(viewport)
    expect(screen.queryByRole('button', { current: true })).not.toBeInTheDocument()

    // Pressing play puts the rail back on the spoken line.
    rerender(rail(segments, 4002, 'playing'))
    expect(screen.getByRole('button', { current: true })).toHaveTextContent('Sentence 2001.')
  })

  it('draws a three-hour transcript from a window, and moves it without a scan', () => {
    const segments = transcriptOf(SEGMENTS_3H)
    let reads = 0
    const watched = new Proxy(segments, {
      get(target, key, receiver) {
        if (typeof key === 'string' && Number.isInteger(Number(key))) reads += 1
        return Reflect.get(target, key, receiver)
      },
    })

    const { rerender } = render(rail(watched, 0, 'playing'))
    sizeViewport()
    expect(screen.getAllByRole('listitem').length).toBeLessThan(80)

    reads = 0
    rerender(rail(watched, 7200, 'playing'))

    expect(screen.getByRole('button', { current: true })).toHaveTextContent('Sentence 3600.')
    expect(reads).toBeLessThan(200)
  })

  it('lays the rows out with the heights it measures', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(64)

    render(rail(transcriptOf(200), 0, 'paused'))

    const rows = screen.getAllByRole('listitem')
    expect(topOf(rows[1]) - topOf(rows[0])).toBe(64)
  })
})
