/**
 * Light, dark, or whatever the system says.
 *
 * The choice is applied to the page here, which is what restyles a chart the stage already
 * has mounted, and the same choice goes upstream so the record agrees with the screen.
 */

import { useState } from 'react'
import { theme } from '@app/theme.ts'
import type { ThemeMode } from '@app/theme.ts'
import './settings.css'

const MODES: readonly ThemeMode[] = ['light', 'dark', 'system']
const LABELS: Record<ThemeMode, string> = { light: 'Light', dark: 'Dark', system: 'System' }

export interface ThemeChoiceProps {
  onChange(mode: ThemeMode): void
}

export function ThemeChoice({ onChange }: ThemeChoiceProps) {
  const [mode, setMode] = useState<ThemeMode>(() => theme.mode())

  function pick(next: ThemeMode): void {
    setMode(next)
    theme.set(next)
    onChange(next)
  }

  return (
    <fieldset className="setting">
      <legend className="setting-title">Theme</legend>
      <div className="setting-choices">
        {MODES.map((value) => (
          <label className="setting-choice" key={value}>
            <input
              type="radio"
              name="theme"
              value={value}
              checked={mode === value}
              onChange={() => pick(value)}
            />
            {LABELS[value]}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
