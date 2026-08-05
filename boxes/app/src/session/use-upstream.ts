/**
 * The page's half of the live channel: one event at a time, posted and forgotten.
 *
 * Nothing waits on the answer. What the server made of an event comes back as a patch, which
 * is the only thing the page trusts about its own state.
 */

import { useCallback, useRef } from 'react'
import { sendUpstream } from './api.ts'
import type { UpstreamEvent } from './events.ts'
import { wireState } from './playback.ts'
import type { Position } from '@player/index.ts'

/** How often a playing video reports where it is. Every other move reports immediately. */
const TICK_MS = 1000

export interface Upstream {
  send(event: UpstreamEvent): void
  /** The player moved. A steady tick is thinned; a play, a pause, a seek or an end is not. */
  report(position: Position): void
}

export function useUpstream(sessionId: string): Upstream {
  const last = useRef({ at: 0, state: '' })

  const send = useCallback(
    (event: UpstreamEvent): void => {
      // The record is the truth about the session, so a refused event is corrected by the
      // next patch rather than argued with here.
      void sendUpstream(sessionId, event).catch(() => {})
    },
    [sessionId],
  )

  const report = useCallback(
    (position: Position): void => {
      const state = wireState(position.state)
      const now = Date.now()
      if (state === last.current.state && state === 'playing' && now - last.current.at < TICK_MS) {
        return
      }
      last.current = { at: now, state }
      send({ type: 'position', time: position.time, state })
    },
    [send],
  )

  return { send, report }
}
