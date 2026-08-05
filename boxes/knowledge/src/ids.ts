import { createHash } from 'node:crypto'

/**
 * Case, spacing and punctuation are noise: "Back-Propagation", "back propagation" and
 * "  Back  propagation " are one concept written four ways.
 */
function normalizeLabel(label: string): string {
  return label
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

const SLUG_CHARS = 48
const DIGEST_CHARS = 10

/**
 * A readable slug plus a digest of the normalized label. The slug is what a human reads in
 * the record; the digest is what keeps two labels apart when they share a prefix or when
 * the slug is empty, so the id is stable across passes and never collides by accident.
 */
export function conceptIdFor(label: string): string {
  const key = normalizeLabel(label)
  const digest = createHash('sha256').update(key).digest('hex').slice(0, DIGEST_CHARS)
  const slug = [...key].slice(0, SLUG_CHARS).join('').trimEnd().replaceAll(' ', '-')
  return slug === '' ? `concept-${digest}` : `${slug}-${digest}`
}
