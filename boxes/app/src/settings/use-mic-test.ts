/**
 * One hold, in the settings panel, so the user can find out whether the microphone works
 * without asking a question they did not want to ask.
 *
 * It keeps what the hold heard and what it measured, because a hold that produced nothing
 * is only explainable with both.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createListener } from '@voice-in/index.ts'
import type { Diagnostic, ListenConfig, Listener, ListenState } from '@voice-in/index.ts'
import { micProblem } from './mic-lines.ts'

export interface MicTest {
  state: ListenState
  /** What the last hold heard, live while it hears it. */
  heard: string
  /** What the last hold measured, kept when it produced no words. */
  diagnostic: Diagnostic | null
  /** Why the microphone is not usable, or null. */
  problem: string | null
  press(): void
  release(): void
}

export function useMicTest(config: ListenConfig, language: string): MicTest {
  const [state, setState] = useState<ListenState>('idle')
  const [heard, setHeard] = useState('')
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const listener = useRef<Listener | null>(null)
  const open = useRef(false)
  const started = useRef<Promise<void>>(Promise.resolve())
  const words = useRef(false)

  useEffect(() => {
    try {
      const created = createListener({
        config,
        language,
        onPartial: setHeard,
        onUtterance: (text) => {
          words.current = text.trim().length > 0
          if (words.current) setHeard(text.trim())
        },
        onState: setState,
        onDiagnostic: setDiagnostic,
      })
      listener.current = created
      setProblem(null)
      return () => {
        listener.current = null
        created.dispose()
      }
    } catch (error) {
      // A config no engine can run is a settings problem, and it belongs on this control.
      listener.current = null
      setProblem(error instanceof Error ? error.message : String(error))
      return
    }
  }, [config, language])

  const press = useCallback((): void => {
    const listening = listener.current
    if (!listening || open.current) return
    open.current = true
    words.current = false
    setHeard('')
    setDiagnostic(null)
    setProblem(null)
    started.current = listening.start()
  }, [])

  const release = useCallback((): void => {
    const listening = listener.current
    if (!listening || !open.current) return
    open.current = false
    void started.current
      .then(() => listening.stop())
      .then(() => {
        if (words.current) return
        setProblem(micProblem(listening.state, listening.reason))
      })
  }, [])

  return { state, heard, diagnostic, problem, press, release }
}
