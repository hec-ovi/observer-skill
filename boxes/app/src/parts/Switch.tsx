/** One choice that is on or off, with its name beside it and nothing explaining it. */

import './switch.css'

export interface SwitchProps {
  label: string
  checked: boolean
  onChange(checked: boolean): void
}

export function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}
