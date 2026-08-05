/** A video second as the user reads it. The rail and the log stamp times the same way. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const pad = (value: number): string => String(value).padStart(2, '0')
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total / 60) % 60
  const rest = total % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`
}
