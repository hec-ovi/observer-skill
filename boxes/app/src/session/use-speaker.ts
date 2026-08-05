/**
 * Saying a line out loud, in whichever voice the settings name.
 *
 * `voice-out` cuts the previous line off by itself, so nothing here queues. What is kept is
 * the reason a line never made a sound, which the settings panel shows next to the button
 * that tried it.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { speak } from '@voice-out/index.ts'
import type { Handle } from '@voice-out/index.ts'
import type { Settings } from './record.ts'
import { voiceOutConfig } from './voice.ts'

export interface Speaker {
  say(text: string, settings: Settings): void
  /** Why the last line made no sound, or null. */
  problem: string | null
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useSpeaker(): Speaker {
  const [problem, setProblem] = useState<string | null>(null)
  const line = useRef<Handle | null>(null)

  useEffect(() => () => line.current?.stop(), [])

  const say = useCallback((text: string, settings: Settings): void => {
    setProblem(null)
    try {
      line.current = speak(text, {
        config: voiceOutConfig(settings.voiceOut),
        language: settings.language,
        onEnd: ({ error }) => {
          if (error) setProblem(error.message)
        },
      })
    } catch (error) {
      // An unusable voice config throws from the call: no line ever starts.
      setProblem(reasonOf(error))
    }
  }, [])

  return { say, problem }
}
