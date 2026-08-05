/**
 * The video in the page: one player mounted for one source, and the lock the server's phase
 * puts on it while the session is being prepared.
 *
 * The lock is a layer over the frame, not a flag inside it, so nothing can be driven from the
 * page or from the frame's own controls until the session is ready.
 */

import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import { createPlayer } from '@player/index.ts'
import type { Player, PlayerError, PlayerSource, Position } from '@player/index.ts'
import { FailureLine } from './FailureLine.tsx'
import './video.css'

/** What the shell may do to the video. Destroying it belongs to this component alone. */
export interface VideoHandle {
  play(): void
  pause(): void
  seek(seconds: number): void
  time(): number
}

export interface VideoProps {
  source: PlayerSource
  /** True while the session is being prepared: the video is visible and cannot be driven. */
  locked: boolean
  /** True while a visual has the region and the video is fading out of it. */
  covered: boolean
  /** Where the session was left, seeked once the video can be controlled. */
  startAt: number
  onPosition(position: Position): void
  ref?: Ref<VideoHandle>
}

export function Video({ source, locked, covered, startAt, onPosition, ref }: VideoProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const player = useRef<Player | null>(null)
  const [failure, setFailure] = useState<PlayerError | null>(null)

  const report = useRef(onPosition)
  const resume = useRef(startAt)
  useEffect(() => {
    report.current = onPosition
    resume.current = startAt
  })

  useEffect(() => {
    const el = host.current
    if (!el) return
    setFailure(null)

    // The player reports ready again once it can correct its own metadata, so the resume is
    // pinned to the first one: the user is never pulled back to where they started.
    let resumed = false
    const created = createPlayer(el, {
      source,
      onReady: () => {
        if (resumed) return
        resumed = true
        if (resume.current > 0) created.seek(resume.current)
      },
      onPosition: (position) => report.current(position),
      onError: (error) => setFailure(error),
    })
    player.current = created

    return () => {
      player.current = null
      created.destroy()
    }
  }, [source])

  useImperativeHandle(
    ref,
    (): VideoHandle => ({
      play: () => player.current?.play(),
      pause: () => player.current?.pause(),
      seek: (seconds) => player.current?.seek(seconds),
      time: () => player.current?.time() ?? 0,
    }),
    [],
  )

  return (
    <div className="video" data-covered={covered}>
      <div className="video-host" ref={host} />
      {locked ? <div className="video-lock" aria-hidden="true" /> : null}
      {failure ? (
        <div className="video-failure glass">
          <FailureLine failure={failure} />
        </div>
      ) : null}
    </div>
  )
}
