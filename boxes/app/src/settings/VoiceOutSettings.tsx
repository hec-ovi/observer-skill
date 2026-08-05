/**
 * Which voice reads the answers, what it costs to download before it is picked, how far that
 * download has got, and a line to hear it say.
 */

import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { PROVIDER_IDS } from '@voice-out/index.ts'
import type { Voice } from '@voice-out/index.ts'
import type { Settings, SettingsPatch, VoiceOutProvider } from '../session/record.ts'
import type { Speaker } from '../session/use-speaker.ts'
import { useVoiceWarm } from './use-voice-warm.ts'
import { VoiceLoading } from './VoiceLoading.tsx'
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
  const warming = useVoiceWarm(settings.voiceOut)

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
  const problem = speaker.problem ?? warming.problem

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

      {warming.progress ? <VoiceLoading progress={warming.progress} /> : null}

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

      <button type="button" className="button" onClick={() => speaker.say(TEST_LINE, settings)}>
        <Volume2 aria-hidden="true" />
        Speak a test line
      </button>

      {problem ? (
        <p className="setting-problem" role="alert">
          {problem}
        </p>
      ) : null}
    </fieldset>
  )
}
