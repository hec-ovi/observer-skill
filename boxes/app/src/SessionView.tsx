/**
 * One session, on screen: the connection, the region the player and the stage share, and
 * whichever shape the page is in.
 *
 * Everything here is composition. The rail, the question box, the log, the visual runtime,
 * the voices and the video each own their own behaviour; this routes events between them and
 * the server, and holds no logic that belongs to one of them.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createListener } from '@voice-in/index.ts'
import type { AskEvent, ListenerSource, RailPosition } from '@dialogue/index.ts'
import type { PlayerSource, Position } from '@player/index.ts'
import { Stage } from '@stage/index.ts'
import type { Artifact as StageArtifact } from '@stage/index.ts'
import { FailureLine } from './parts/FailureLine.tsx'
import { Video } from './parts/Video.tsx'
import type { VideoHandle } from './parts/Video.tsx'
import { Preparing } from './screens/Preparing.tsx'
import { phaseTitle } from './screens/preparing-lines.ts'
import { Session } from './screens/Session.tsx'
import { artifactUrl } from './session/artifact-url.ts'
import { isPreparing } from './session/record.ts'
import type { LogEntry, Settings, SettingsPatch } from './session/record.ts'
import { unusableListener } from './session/unusable-listener.ts'
import { useQuestions } from './session/use-questions.ts'
import { useSession } from './session/use-session.ts'
import { useSpeaker } from './session/use-speaker.ts'
import { useStage } from './session/use-stage.ts'
import { useUpstream } from './session/use-upstream.ts'
import { useVerifier } from './session/use-verifier.ts'
import { listenConfig } from './session/voice.ts'
import { SettingsPanel } from './settings/SettingsPanel.tsx'
import './app.css'

const NO_LOG: readonly LogEntry[] = []
const START: RailPosition = { time: 0, state: 'idle' }
const DEFAULT_VOICE_IN: Settings['voiceIn'] = { provider: 'web-speech', endpoint: null }

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export interface SessionViewProps {
  sessionId: string
}

export function SessionView({ sessionId }: SessionViewProps) {
  const video = useRef<VideoHandle | null>(null)
  const [moved, setMoved] = useState<Position | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const upstream = useUpstream(sessionId)
  const speaker = useSpeaker()
  const stage = useStage(video)
  const settings = useRef<Settings | null>(null)

  const verifier = useVerifier((result) =>
    upstream.send({
      type: 'verify-result',
      requestId: result.requestId,
      ok: result.ok,
      errors: result.errors,
      size: result.size,
      snapshot: result.snapshot ?? null,
    }),
  )

  const connection = useSession(sessionId, {
    say: (event) => {
      const current = settings.current
      if (event.speak && current) speaker.say(event.text, current)
    },
    show: (event) => stage.show(event.artifactId),
    hide: stage.hide,
    verify: (request) => verifier.verify(request),
  })

  const record = connection.record
  useEffect(() => {
    settings.current = record?.settings ?? null
  })

  const { entries, remember } = useQuestions(record?.log ?? NO_LOG)

  const source = record?.source
  const playerSource = useMemo<PlayerSource | null>(
    () =>
      source
        ? {
            provider: source.provider,
            videoId: source.videoId,
            url: source.url,
            title: source.title,
            duration: source.duration ?? undefined,
          }
        : null,
    [source],
  )

  const voiceIn = record?.settings.voiceIn ?? DEFAULT_VOICE_IN
  const language = record?.settings.language ?? 'en'
  const config = useMemo(() => listenConfig(voiceIn), [voiceIn])
  const listener = useCallback<ListenerSource>(
    (handlers) => {
      try {
        return createListener({ config, language, ...handlers })
      } catch (error) {
        return unusableListener(reasonOf(error), handlers)
      }
    },
    [config, language],
  )

  const artifact = useMemo<StageArtifact | null>(() => {
    const showing = stage.showing
    if (!record || !showing) return null
    const found = record.artifacts.find(
      (candidate) => candidate.id === showing.artifactId && candidate.status === 'built',
    )
    return found ? { id: found.id, title: found.title, url: artifactUrl(record.id, found.id) } : null
  }, [record, stage.showing])

  const onPosition = useCallback(
    (position: Position): void => {
      setMoved(position)
      upstream.report(position)
    },
    [upstream],
  )

  const at = useCallback((): number => video.current?.time() ?? 0, [])
  const onSeek = useCallback((seconds: number): void => video.current?.seek(seconds), [])

  const onAsk = useCallback(
    ({ text, at: asked, via }: AskEvent): void => {
      remember(text, asked)
      upstream.send({ type: 'ask', text, at: asked, via })
    },
    [remember, upstream],
  )

  const onReplay = useCallback(
    (entryId: string): void => {
      const entry = entries.find((candidate) => candidate.id === entryId)
      const current = settings.current
      if (entry && current) speaker.say(entry.text, current)
    },
    [entries, speaker],
  )

  const changeSettings = useCallback(
    (patch: SettingsPatch): void => {
      connection.apply({ settings: patch })
      upstream.send({ type: 'settings', at: at(), settings: patch })
    },
    [at, connection, upstream],
  )

  const retry = useCallback((): void => {
    if (!record) return
    upstream.send({
      type: 'ask',
      text: `Try ${phaseTitle(record.phase).toLowerCase()} again.`,
      at: at(),
      via: 'text',
    })
  }, [at, record, upstream])

  const preparing = record ? isPreparing(record.phase) : true

  return (
    <main className="page">
      <header className="page-head">
        <h1 className="page-title">{record?.source.title ?? ''}</h1>
        <button type="button" onClick={() => setPanelOpen(true)}>
          Settings
        </button>
      </header>

      <div className="page-body">
        <div className="viewer">
          {playerSource ? (
            <Video
              ref={video}
              source={playerSource}
              locked={preparing}
              covered={artifact !== null}
              startAt={record?.position.time ?? 0}
              onPosition={onPosition}
            />
          ) : null}
          <Stage
            active={artifact !== null}
            artifact={artifact}
            time={stage.showing?.at ?? 0}
            onDismiss={stage.hide}
          />
        </div>

        {connection.failure ? (
          <div className="page-failure">
            <FailureLine failure={connection.failure} />
          </div>
        ) : null}

        {record && preparing ? (
          <Preparing
            phase={record.phase}
            progress={record.progress}
            concepts={record.concepts}
            artifacts={record.artifacts}
            failure={record.error}
            onRetry={retry}
          />
        ) : null}

        {record && !preparing ? (
          <Session
            segments={connection.segments}
            position={moved ?? record.position ?? START}
            entries={entries}
            listener={listener}
            disabled={!record.agent.attached}
            at={at}
            onSeek={onSeek}
            onAsk={onAsk}
            onShow={stage.show}
            onReplay={onReplay}
            onOpenSettings={() => setPanelOpen(true)}
          />
        ) : null}
      </div>

      {panelOpen && record ? (
        <SettingsPanel
          settings={record.settings}
          speaker={speaker}
          onChange={changeSettings}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </main>
  )
}
