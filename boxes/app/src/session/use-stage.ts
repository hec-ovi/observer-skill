/**
 * Which visual has the region, and the second it was opened at.
 *
 * Opening one pauses the video, because the user is about to read rather than watch, and
 * closing it leaves the video paused for the same reason.
 */

import { useCallback, useState } from 'react'
import type { RefObject } from 'react'
import type { VideoHandle } from '../parts/Video.tsx'

export interface Showing {
  artifactId: string
  /** The video second the visual was opened at, which reaches the module as `ctx.time`. */
  at: number
}

export interface StageControls {
  showing: Showing | null
  show(artifactId: string): void
  hide(): void
}

export function useStage(video: RefObject<VideoHandle | null>): StageControls {
  const [showing, setShowing] = useState<Showing | null>(null)

  const show = useCallback(
    (artifactId: string): void => {
      const handle = video.current
      handle?.pause()
      setShowing({ artifactId, at: handle?.time() ?? 0 })
    },
    [video],
  )

  const hide = useCallback((): void => setShowing(null), [])

  return { showing, show, hide }
}
