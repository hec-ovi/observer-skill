/**
 * The watch page states a publish date as display text ("Oct 5, 2017", sometimes behind a
 * "Premiered" or "Streamed live on" prefix). The research pass compares that date against
 * today, so it becomes a plain ISO date.
 */

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
]

const DATE = /([A-Za-z]{3,})\s+(\d{1,2}),\s*(\d{4})/

/** `YYYY-MM-DD`, or null when the text carries no date we recognise. */
export function parsePublished(text: string | undefined): string | null {
  if (text === undefined) return null

  const match = DATE.exec(text)
  if (!match) return null

  const [, name, day, year] = match
  if (name === undefined || day === undefined || year === undefined) return null

  const month = MONTHS.indexOf(name.slice(0, 3).toLowerCase())
  if (month < 0) return null

  const dayNumber = Number(day)
  if (dayNumber < 1 || dayNumber > 31) return null

  return `${year}-${String(month + 1).padStart(2, '0')}-${day.padStart(2, '0')}`
}
