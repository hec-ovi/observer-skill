/**
 * A line of any length becomes a list of chunks the model can hold in one context.
 *
 * The graph was exported with 1000 KV positions, and the bundle caps a chunk at 50 tokens,
 * so long text is split rather than cut: every word is spoken. Chunks are independent (the
 * state resets at each boundary), which is what makes splitting safe.
 */

import type { PocketBundle } from './bundle.ts'
import type { Tokenizer } from './tokenizer.ts'

const SENTENCE = /[^.!?]+[.!?]+|[^.!?]+$/g
const STARTS_UPPER = /^[A-ZÀ-Þ]/
const ENDS_WORD = /[0-9A-Za-zÀ-ÿ]$/
const SHORT_INPUT_PAD = '        '

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/** What the model was trained to see: one line of clean text, capitalised, terminated. */
export function prepareText(text: string, bundle: PocketBundle): string {
  let prepared = text.replace(/\s+/g, ' ').trim()
  if (bundle.remove_semicolons) prepared = prepared.replaceAll(';', ',')
  if (prepared && !STARTS_UPPER.test(prepared)) {
    prepared = prepared.charAt(0).toUpperCase() + prepared.slice(1)
  }
  if (ENDS_WORD.test(prepared)) prepared += '.'
  if (bundle.pad_with_spaces_for_short_inputs && wordCount(prepared) < 5) {
    prepared = SHORT_INPUT_PAD + prepared
  }
  return prepared
}

/** Sentences packed greedily up to the token cap; one long sentence is split on tokens. */
export function splitChunks(text: string, tokenizer: Tokenizer, maxTokens: number): string[] {
  const sentences = text.match(SENTENCE)?.map((part) => part.trim()).filter(Boolean) ?? []
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (tokenizer.encode(sentence).length > maxTokens) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      chunks.push(...splitOnTokens(sentence, tokenizer, maxTokens))
      continue
    }
    const merged = current ? `${current} ${sentence}` : sentence
    if (tokenizer.encode(merged).length <= maxTokens) {
      current = merged
    } else {
      if (current) chunks.push(current)
      current = sentence
    }
  }

  if (current) chunks.push(current)
  return chunks.length > 0 ? chunks : [text]
}

function splitOnTokens(sentence: string, tokenizer: Tokenizer, maxTokens: number): string[] {
  const ids = tokenizer.encode(sentence)
  const parts: string[] = []
  for (let start = 0; start < ids.length; start += maxTokens) {
    parts.push(tokenizer.decode(ids.slice(start, start + maxTokens)))
  }
  return parts
}

/** How long to keep generating after the model says it is done. Short lines need more. */
export function framesAfterEos(text: string, bundle: PocketBundle): number {
  if (bundle.model_recommended_frames_after_eos != null) {
    return bundle.model_recommended_frames_after_eos
  }
  return wordCount(text) <= 4 ? 3 : 1
}
