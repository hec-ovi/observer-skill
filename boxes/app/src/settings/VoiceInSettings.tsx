/**
 * Which engine hears the questions, and a hold that proves it does.
 *
 * A refused microphone shows right here, beside the control that asked for it, because this
 * is the only place it can be fixed.
 */

import { useMemo } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { Settings, SettingsPatch, VoiceInProvider } from '../session/record.ts'
import { listenConfig } from '../session/voice.ts'
import { diagnosticLine } from './mic-lines.ts'
import { useMicTest } from './use-mic-test.ts'
import './settings.css'

const PROVIDERS: readonly VoiceInProvider[] = ['web-speech', 'whisper-web', 'endpoint']

const NAMES: Record<VoiceInProvider, string> = {
  'web-speech': 'Browser recognition',
  'whisper-web': 'Whisper in the browser',
  endpoint: 'Endpoint',
}

/** Keys that hold the test button down, for a user who is not holding a pointer. */
const HOLD_KEYS = new Set([' ', 'Enter'])

export interface VoiceInSettingsProps {
  voiceIn: Settings['voiceIn']
  language: string
  onChange(patch: SettingsPatch): void
}

export function VoiceInSettings({ voiceIn, language, onChange }: VoiceInSettingsProps) {
  const config = useMemo(() => listenConfig(voiceIn), [voiceIn])
  const mic = useMicTest(config, language)

  function onDown(event: PointerEvent<HTMLButtonElement>): void {
    event.currentTarget.setPointerCapture(event.pointerId)
    mic.press()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!HOLD_KEYS.has(event.key) || event.repeat) return
    event.preventDefault()
    mic.press()
  }

  function onKeyUp(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!HOLD_KEYS.has(event.key)) return
    mic.release()
  }

  return (
    <fieldset className="setting">
      <legend className="setting-title">Microphone</legend>

      <label className="setting-row">
        Engine
        <select
          value={voiceIn.provider}
          onChange={(event) =>
            onChange({ voiceIn: { provider: event.target.value as VoiceInProvider } })
          }
        >
          {PROVIDERS.map((id) => (
            <option key={id} value={id}>
              {NAMES[id]}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        aria-pressed={mic.state === 'listening'}
        onPointerDown={onDown}
        onPointerUp={mic.release}
        onPointerCancel={mic.release}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        Hold to test
      </button>

      <p className="setting-note" role="status">
        {mic.heard}
      </p>

      {mic.problem ? (
        <p className="setting-problem" role="alert">
          {mic.problem}
        </p>
      ) : null}

      {!mic.heard && mic.diagnostic ? (
        <p className="setting-note">{diagnosticLine(mic.diagnostic)}</p>
      ) : null}
    </fieldset>
  )
}
