/**
 * The surface a visual appears on.
 *
 * It draws the title and the caption, loads the module, gives it the theme and the space,
 * cross-fades with the player, and takes it away again. One artifact is mounted at a time,
 * and its teardown runs on every path out, including a failure and a page unload.
 */

import { useEffect, useRef, useState } from 'react'
import { theme } from '@app/theme.ts'
import { StageError, stageErrorLine, type StageErrorCode } from './errors.ts'
import { loadArtifactModule } from './loader.ts'
import { ArtifactRuntime } from './runtime.ts'
import type { Artifact } from './types.ts'
import './stage.css'

export interface StageProps {
  /** Drives the cross-fade with the player. */
  active: boolean
  artifact: Artifact | null
  /** The video second this was opened at, handed to the module as `ctx.time`. */
  time?: number
  onDismiss(): void
}

/** The length of the cross-fade, which is `0` under `prefers-reduced-motion`. */
function motionMs(): number {
  return theme.readTokens().motionMs
}

function codeOf(error: unknown): StageErrorCode {
  return error instanceof StageError ? error.code : 'ARTIFACT_MOUNT_FAILED'
}

export function Stage({ active, artifact, time = 0, onDismiss }: StageProps) {
  const [shown, setShown] = useState<Artifact | null>(null)
  const [entered, setEntered] = useState(false)
  const [failure, setFailure] = useState<StageErrorCode | null>(null)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const runtimeRef = useRef<ArtifactRuntime | null>(null)
  const timeRef = useRef(time)
  useEffect(() => {
    timeRef.current = time
  })

  const visible = active && artifact !== null
  const url = shown?.url ?? null

  // What is on the stage: the artifact while it is active, the last one while it fades out.
  useEffect(() => {
    if (visible && artifact) {
      setShown(artifact)
      return
    }
    const motion = motionMs()
    if (motion === 0) {
      setShown(null)
      return
    }
    const timer = setTimeout(() => setShown(null), motion)
    return () => clearTimeout(timer)
  }, [visible, artifact])

  // The fade itself, one frame after the element is in the document so it has somewhere to
  // come from. Under reduced motion the transition is 0 ms and this is a plain swap.
  useEffect(() => {
    if (!shown || !visible) {
      setEntered(false)
      return
    }
    if (motionMs() === 0) {
      setEntered(true)
      return
    }
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [shown, visible])

  // The module: loaded once per url, and torn down on every path out of this effect.
  useEffect(() => {
    const host = hostRef.current
    if (!url || !host) return
    let cancelled = false
    let runtime: ArtifactRuntime | null = null
    setFailure(null)

    void (async () => {
      try {
        const module = await loadArtifactModule(url)
        if (cancelled) return
        const box = host.getBoundingClientRect()
        runtime = new ArtifactRuntime(host, module, {
          theme: theme.readTokens(),
          time: timeRef.current,
          size: { width: box.width, height: box.height },
        })
        runtime.mount()
        runtimeRef.current = runtime
      } catch (error) {
        if (!cancelled) setFailure(codeOf(error))
      }
    })()

    return () => {
      cancelled = true
      runtime?.unmount()
      if (runtimeRef.current === runtime) runtimeRef.current = null
    }
  }, [url])

  // A theme change restyles a mounted module in place. Nothing is rebuilt or remounted.
  useEffect(
    () =>
      theme.subscribe(() => {
        runtimeRef.current?.themeChanged(theme.readTokens())
      }),
    [],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) runtimeRef.current?.resized({ width: box.width, height: box.height })
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [shown])

  // A page that goes away still runs the module's cleanup.
  useEffect(() => {
    const unmount = (): void => runtimeRef.current?.unmount()
    addEventListener('pagehide', unmount)
    return () => removeEventListener('pagehide', unmount)
  }, [])

  useEffect(() => {
    if (!shown) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [shown, onDismiss])

  if (!shown) return null

  return (
    <section className="stage" data-phase={entered ? 'in' : 'out'}>
      <header className="stage-head">
        <div>
          <h2 className="stage-title">{shown.title}</h2>
          {shown.caption ? <p className="stage-caption">{shown.caption}</p> : null}
        </div>
        {failure ? null : (
          <button type="button" className="stage-close" onClick={onDismiss}>
            Close
          </button>
        )}
      </header>

      <div className="stage-canvas" ref={hostRef} />

      {failure ? (
        <p className="stage-failure" role="alert">
          {stageErrorLine(failure)}
          <button type="button" onClick={onDismiss}>
            Back to the video
          </button>
        </p>
      ) : null}
    </section>
  )
}
