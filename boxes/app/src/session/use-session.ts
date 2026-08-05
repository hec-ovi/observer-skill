/**
 * The session, as the page holds it: read once over REST, then followed by patches.
 *
 * Nothing here polls. A patch that arrives while the first read is still in flight is kept
 * and applied the moment the record lands, so a fast server never gets ahead of the page.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Segment } from '@dialogue/index.ts'
import { failureOf, readSession, readTranscript } from './api.ts'
import { LiveChannel } from './channel.ts'
import type { SayEvent, ShowEvent, VerifyEvent } from './events.ts'
import { mergePatch } from './merge.ts'
import type { Failure, Session, SessionPatch } from './record.ts'

/** What the shell does with the things the record does not carry. */
export interface SessionSignals {
  say(event: SayEvent): void
  show(event: ShowEvent): void
  hide(): void
  verify(event: VerifyEvent): void
}

export interface Connection {
  record: Session | null
  segments: readonly Segment[]
  /** Why the session could not be read. A dropped stream is not one: it reconnects. */
  failure: Failure | null
  /** Move the local record now, without waiting for the server to echo the change back. */
  apply(patch: SessionPatch): void
}

export function useSession(sessionId: string, signals: SessionSignals): Connection {
  const [record, setRecord] = useState<Session | null>(null)
  const [segments, setSegments] = useState<readonly Segment[]>([])
  const [failure, setFailure] = useState<Failure | null>(null)

  const latest = useRef(signals)
  useEffect(() => {
    latest.current = signals
  })

  const apply = useCallback((patch: SessionPatch): void => {
    setRecord((current) => (current ? mergePatch(current, patch) : current))
  }, [])

  useEffect(() => {
    let live = true
    let landed = false
    const early: SessionPatch[] = []

    const patch = (change: SessionPatch): void => {
      if (!landed) {
        early.push(change)
        return
      }
      setRecord((current) => (current ? mergePatch(current, change) : current))
    }

    const load = (): void => {
      void readSession(sessionId)
        .then((fetched) => {
          if (!live) return
          landed = true
          setRecord(early.reduce<Session>((merged, held) => mergePatch(merged, held), fetched))
          early.length = 0
          setFailure(null)
        })
        .catch((error: unknown) => {
          if (live) setFailure(failureOf(error))
        })
    }

    const channel = new LiveChannel(sessionId, {
      patch,
      phase: ({ phase, progress }) => patch({ phase, progress }),
      say: (event) => latest.current.say(event),
      show: (event) => latest.current.show(event),
      hide: () => latest.current.hide(),
      verify: (event) => latest.current.verify(event),
      resumed: load,
    })

    load()
    channel.open()

    return () => {
      live = false
      channel.close()
    }
  }, [sessionId])

  // The transcript exists once the session has been through transcribing, and is read once.
  const segmentCount = record?.transcript?.segmentCount ?? 0
  useEffect(() => {
    if (segmentCount === 0) return
    let live = true
    void readTranscript(sessionId)
      .then((read) => {
        if (live) setSegments(read)
      })
      .catch((error: unknown) => {
        if (live) setFailure(failureOf(error))
      })
    return () => {
      live = false
    }
  }, [sessionId, segmentCount])

  return { record, segments, failure, apply }
}
