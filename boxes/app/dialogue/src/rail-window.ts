/**
 * Which rows the rail draws, and where its viewport points.
 *
 * Following is the default and lasts until the user scrolls by hand: every scroll that does
 * not land where this hook put it is theirs, and following resumes when the video is played
 * again. Only the rows around the viewport exist, so the length of the transcript costs
 * nothing to draw.
 */

import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RowMetrics } from './row-metrics.ts'

/** A row's height before it has been on screen once. */
const ESTIMATE = 40
/** Rows kept above and below the viewport, so a scroll never uncovers a gap. */
const OVERSCAN = 12
/** Where in the viewport the spoken line sits while the rail is following. */
const FOLLOW_AT = 1 / 3

export interface RailWindowOptions {
  count: number
  /** The line being spoken, or `-1` when there are no lines. */
  current: number
  playing: boolean
}

export interface RailWindow {
  viewportRef: RefObject<HTMLDivElement | null>
  /** The rows to draw, `[start, end)`. */
  start: number
  end: number
  /** The height of the whole transcript, drawn or not. */
  total: number
  offsetOf(i: number): number
  measure(i: number, el: HTMLElement): void
  onScroll(): void
}

export function useRailWindow({ count, current, playing }: RailWindowOptions): RailWindow {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const metrics = useMemo(() => new RowMetrics(count, ESTIMATE), [count])
  const [height, setHeight] = useState(0)
  const [start, setStart] = useState(0)
  const [following, setFollowing] = useState(true)
  /** Bumped when a measured row moves the offsets, which is the only reason to lay out again. */
  const [layout, setLayout] = useState(0)
  /** Where this hook last put the viewport. Anything else is the user's own scrolling. */
  const placedAt = useRef<number | null>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) setHeight(box.height)
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const startFor = useCallback(
    (top: number): number => Math.max(0, metrics.indexAt(top) - OVERSCAN),
    [metrics],
  )

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !following || current < 0) return
    const furthest = Math.max(0, metrics.total() - height)
    const top = Math.max(0, Math.min(metrics.offsetOf(current) - height * FOLLOW_AT, furthest))
    setStart(startFor(top))
    viewport.scrollTop = top
    // Read back rather than assumed: the browser clamps, and the clamped value is the one a
    // later scroll event has to match to count as ours.
    placedAt.current = viewport.scrollTop
  }, [current, following, height, layout, metrics, startFor])

  const wasPlaying = useRef(playing)
  useEffect(() => {
    if (playing && !wasPlaying.current) setFollowing(true)
    wasPlaying.current = playing
  }, [playing])

  const onScroll = useCallback((): void => {
    const viewport = viewportRef.current
    if (!viewport) return
    const top = viewport.scrollTop
    if (placedAt.current !== null && Math.abs(top - placedAt.current) <= 1) return
    placedAt.current = null
    setFollowing(false)
    setStart(startFor(top))
  }, [startFor])

  const measure = useCallback(
    (i: number, el: HTMLElement): void => {
      if (metrics.measured(i, el.offsetHeight)) setLayout((value) => value + 1)
    },
    [metrics],
  )

  const rows = Math.ceil(height / ESTIMATE) + OVERSCAN * 2
  return {
    viewportRef,
    start,
    end: Math.min(count, start + rows),
    total: metrics.total(),
    offsetOf: (i: number): number => metrics.offsetOf(i),
    measure,
    onScroll,
  }
}
