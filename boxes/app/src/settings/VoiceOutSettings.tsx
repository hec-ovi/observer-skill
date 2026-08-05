/**
 * Which voice reads the answers, what it costs to download before it is picked, and a line
 * to hear it say.
 */

import { useEffect, useState } from 'react'
import { PROVIDER_IDS } from '@voice-out/index.ts'
import type { Voice } from '@voice-out/index.ts'
import type { Settings, SettingsPatch, VoiceOutProvider } from '../session/record.ts'
import type { Speaker } from '../session/use-speaker.ts'
import { costOf, downloadSize, VOICE_OUT_NAMES, voicesOf } from './voice-catalog.ts'
import './settings.css'

const TEST_LINE = 'This is the voice that reads the answers.'

function optionLabel(provider: VoiceOutProvider): string {
  const { downloadBytes } = costOf(provider)
  const name = VOICE_OUT_NAMES[provider]
  return downloadBytes > 0 ? `${name}, ${downloadSize(downloadBytes)} download` : name
}

export interface VoiceOutSettingsProps {
  settings: Settings
  speaker: Speaker
  onChange(patch: SettingsPatch): void
}

export function VoiceOutSettings({ settings, speaker, onChange }: VoiceOutSettingsProps) {
  const { provider, voice } = settings.voiceOut
  const [choices, setChoices] = useState<readonly Voice[]>([])

  useEffect(() => {
    let live = true
    void voicesOf({ provider }).then((found) => {
      if (live) setChoices(found)
    })
    return () => {
      live = false
    }
  }, [provider])

  const { attribution } = costOf(provider)

  return (
    <fieldset className="setting">
      <legend className="setting-title">Voice</legend>

      <label className="setting-row">
        Engine
        <select
          value={provider}
          onChange={(event) =>
            onChange({ voiceOut: { provider: event.target.value as VoiceOutProvider, voice: null } })
          }
        >
          {PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {optionLabel(id)}
            </option>
          ))}
        </select>
      </label>

      {choices.length > 0 ? (
        <label className="setting-row">
          Voice
          <select
            value={voice ?? ''}
            onChange={(event) => onChange({ voiceOut: { voice: event.target.value || null } })}
          >
            <option value="">Default</option>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {attribution ? <p className="setting-note">{attribution}</p> : null}

      <button type="button" onClick={() => speaker.say(TEST_LINE, settings)}>
        Speak a test line
      </button>

      {speaker.problem ? (
        <p className="setting-problem" role="alert">
          {speaker.problem}
        </p>
      ) : null}
    </fieldset>
  )
}
