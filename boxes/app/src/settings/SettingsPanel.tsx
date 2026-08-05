/**
 * Settings, over the page rather than at a route, so nothing about the session is lost while
 * they are open.
 *
 * Every change is applied to the page as it is made and sent upstream in the same tick, so
 * the agent and the screen never disagree about which voice is speaking.
 */

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Switch } from '../parts/Switch.tsx'
import type { Settings, SettingsPatch } from '../session/record.ts'
import type { Speaker } from '../session/use-speaker.ts'
import { ThemeChoice } from './ThemeChoice.tsx'
import { VoiceInSettings } from './VoiceInSettings.tsx'
import { VoiceOutSettings } from './VoiceOutSettings.tsx'
import './settings.css'

export interface SettingsPanelProps {
  settings: Settings
  speaker: Speaker
  onChange(patch: SettingsPatch): void
  onClose(): void
}

export function SettingsPanel({ settings, speaker, onChange, onClose }: SettingsPanelProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="panel glass rise" role="dialog" aria-label="Settings">
      <header className="panel-head">
        <h2 className="panel-title">Settings</h2>
        <button type="button" className="button-ghost" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>

      <ThemeChoice onChange={(theme) => onChange({ theme })} />

      <VoiceOutSettings settings={settings} speaker={speaker} onChange={onChange} />

      <VoiceInSettings
        voiceIn={settings.voiceIn}
        language={settings.language}
        onChange={onChange}
      />

      <fieldset className="setting">
        <legend className="setting-title">Preparation</legend>
        <Switch
          label="Use extra knowledge"
          checked={settings.extraKnowledge}
          onChange={(extraKnowledge) => onChange({ extraKnowledge })}
        />
        <Switch
          label="Build visuals"
          checked={settings.toolkit}
          onChange={(toolkit) => onChange({ toolkit })}
        />
      </fieldset>
    </div>
  )
}
