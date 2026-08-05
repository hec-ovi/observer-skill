/**
 * Getting the chosen voice ready, and keeping the panel told while it happens.
 *
 * A voice with a download costs its whole model before the first word. `warm` reports the
 * bytes as they arrive, so the panel can show them instead of a control that looks stuck.
 * Providers that download nothing are never warmed: there is nothing to wait for.
 */

import { useEffect, useState } from 'react'
import { warm } from '@voice-out/index.ts'
import type { WarmProgress } from '@voice-out/index.ts'
import type { Settings } from '../session/record.ts'
import { voiceOutConfig } from '../session/voice.ts'
import { costOf } from './voice-catalog.ts'

export interface VoiceWarming {
  /** Where the download is now, or null when nothing is loading. */
  progress: WarmProgress | null
  /** Why the voice could not be loaded, or null. */
  problem: string | null
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useVoiceWarm(voiceOut: Settings['voiceOut']): VoiceWarming {
  const { provider, voice } = voiceOut
  const [progress, setProgress] = useState<WarmProgress | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    setProgress(null)
    setProblem(null)
    if (costOf(provider).downloadBytes === 0) return

    let live = true
    void warm(voiceOutConfig({ provider, voice }), (report) => {
      if (live) setProgress(report)
    }).then(
      () => {
        if (live) setProgress(null)
      },
      (error: unknown) => {
        if (live) {
          setProgress(null)
          setProblem(reasonOf(error))
        }
      },
    )

    return () => {
      live = false
    }
  }, [provider, voice])

  return { progress, problem }
}
