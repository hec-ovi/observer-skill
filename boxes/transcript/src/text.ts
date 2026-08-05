/** Text hygiene shared by every caption format: entities, whitespace, comparison keys. */

/** Terminal punctuation, optionally wrapped by a closing quote or bracket. */
export const TERMINAL = /[.!?…。！？]["')\]]?$/

/** A sound cue the caption track wrote for itself: [Music], [Applause], [음악]. */
export const MARKER = /^\[[^\]]*\]$/

export function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** Decoded, single spaced, no line breaks, trimmed. */
export function tidy(input: string): string {
  return decodeEntities(input).replace(/\r/g, '').replace(/[\n\t]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** What two words are compared by when looking for a repeated run. */
export function wordKey(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

/** Sentence spacing: no space before the punctuation that closes it. */
export function joinWords(words: string[]): string {
  return words.join(' ').replace(/\s+([,.;:!?…])/g, '$1')
}

export function seconds(value: number): number {
  return Math.round(value * 1000) / 1000
}
