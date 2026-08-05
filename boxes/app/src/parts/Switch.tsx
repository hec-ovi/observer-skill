/**
 * One choice that is on or off, with its name beside it and nothing explaining it.
 *
 * The checkbox stays in the page: it carries the role, the state and the keyboard. Only its
 * box is hidden, and the track beside it is what the eye reads.
 */

import './switch.css'

export interface SwitchProps {
  label: string
  checked: boolean
  onChange(checked: boolean): void
}

export function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <label className="switch">
      <span className="switch-label">{label}</span>
      <input
        className="switch-input"
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </label>
  )
}
