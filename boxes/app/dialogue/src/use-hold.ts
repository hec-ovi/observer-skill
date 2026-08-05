/**
 * One press of the talk button, from open microphone to finished sentence.
 *
 * The listener comes from outside, so nothing here touches a microphone: this owns when a
 * hold opens, what it shows while it hears, and what it says when it heard nothing.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Listener, ListenState } from '../../voice-in/schema/voice-in.ts'
import { holdProblem } from './hold-lines.ts'
import type { ListenerSource } from './types.ts'

export interface HoldOptions {
  listener: ListenerSource
  /** One finished sentence, once per hold that produced words. */
  onUtterance(text: string): void
}

export interface HoldControls {
  state: ListenState
  holding: boolean
  /** What the engine has heard so far in this hold. */
  partial: string
  /** Why the last hold produced nothing, or null. */
  problem: string | null
  /** True when the hold opened. A press lands on nothing while the last one is still out. */
  press(): boolean
  release(): void
}

export function useHold({ listener, onUtterance }: HoldOptions): HoldControls {
  const [state, setState] = useState<ListenState>('idle')
  const [holding, setHolding] = useState(false)
  const [partial, setPartial] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const instance = useRef<Listener | null>(null)
  const open = useRef(false)
  /** A hold that is not finished: still held, or released and still being transcribed. */
  const unsettled = useRef(false)
  const heard = useRef(false)
  const started = useRef<Promise<void>>(Promise.resolve())
  const deliver = useRef(onUtterance)
  useEffect(() => {
    deliver.current = onUtterance
  })

  useEffect(() => {
    const created = listener({
      onPartial: (text) => setPartial(text),
      onUtterance: (text) => {
        const said = text.trim()
        heard.current = said.length > 0
        if (said) deliver.current(said)
      },
      onState: (next) => setState(next),
    })
    instance.current = created
    return () => {
      instance.current = null
      created.dispose()
    }
  }, [listener])

  /**
   * A press while the last hold is still being transcribed opens nothing: the engine ignores
   * it anyway, and taking it would hand the words still in flight the wrong moment. The
   * status line already says the transcription is out, so the user is not left guessing.
   */
  const press = useCallback((): boolean => {
    const listening = instance.current
    if (!listening || unsettled.current) return false
    open.current = true
    unsettled.current = true
    heard.current = false
    setPartial('')
    setProblem(null)
    setHolding(true)
    started.current = listening.start()
    return true
  }, [])

  const release = useCallback((): void => {
    const listening = instance.current
    if (!listening || !open.current) return
    open.current = false
    setHolding(false)
    // The hold is closed in the order it was opened, so a release that beats the microphone
    // still ends the session the press asked for.
    void started.current
      .then(() => listening.stop())
      .then(() => {
        unsettled.current = false
        setPartial('')
        if (heard.current) return
        setProblem(holdProblem(listening.state, listening.reason))
      })
  }, [])

  return { state, holding, partial, problem, press, release }
}
