/**
 * transcript: a source becomes timed text, and a second of video becomes the words that were
 * being said then. See CONTRACT.md.
 */

export { fetchTranscript as fetch } from './fetch.ts'
export { read } from './read.ts'
export { at } from './at.ts'

export type {
  AtOptions,
  FetchOptions,
  Progress,
  ProgressFn,
  ProviderChoice,
  ProviderId,
  ReadOptions,
  Segment,
  TranscriptPage,
  TranscriptRef,
  TranscriptWindow,
} from './schema.ts'
