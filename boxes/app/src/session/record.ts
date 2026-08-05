/**
 * The session record, as the page reads it.
 *
 * `web-host` owns the shape and serves it over REST and as patches; this is the app's view
 * of it, narrowed to what the page draws. Fields that only mean something on the server
 * (where a bundle sits on disk) are left out, and a patch carrying them is simply kept.
 */

export type Phase = 'feed' | 'transcribing' | 'researching' | 'building' | 'ready' | 'live'

/** The phases the player is locked in: the server's word, never a local flag. */
export const PREPARING_PHASES: readonly Phase[] = ['feed', 'transcribing', 'researching', 'building']

export type ThemeChoice = 'light' | 'dark' | 'system'
export type VoiceOutProvider = 'pocket' | 'web-speech' | 'endpoint'
export type VoiceInProvider = 'web-speech' | 'whisper-web' | 'endpoint'

/** Playback as the live channel spells it, which is not the player's own vocabulary. */
export type PlaybackState = 'idle' | 'playing' | 'paused' | 'buffering' | 'ended'

export interface Source {
  provider: string
  videoId: string
  url: string
  title: string
  channel: string
  duration: number | null
  publishedAt: string | null
  hasCaptions: boolean | null
  captionLanguages: string[]
  hasAds: boolean
  embeddable: boolean
  degraded: boolean
}

export interface Settings {
  theme: ThemeChoice
  language: string
  extraKnowledge: boolean
  toolkit: boolean
  voiceOut: { provider: VoiceOutProvider; voice: string | null }
  voiceIn: { provider: VoiceInProvider; endpoint: string | null }
}

/** Only the fields the user touched. */
export interface SettingsPatch {
  theme?: ThemeChoice
  language?: string
  extraKnowledge?: boolean
  toolkit?: boolean
  voiceOut?: { provider?: VoiceOutProvider; voice?: string | null }
  voiceIn?: { provider?: VoiceInProvider; endpoint?: string | null }
}

export interface Progress {
  step: string
  done: number
  total: number
  message: string
}

/** The shared error shape, on the record and in a refused response alike. */
export interface Failure {
  code: string
  message: string
  hint: string
}

export interface TranscriptRef {
  provider: string
  language: string
  segmentCount: number
  duration: number
}

export interface Note {
  id: string
  kind: 'background' | 'current'
  text: string
  source: string | null
  addedAt: string
}

export interface Concept {
  id: string
  label: string
  kind: 'definition' | 'equation' | 'system' | 'jargon'
  startsAt: number
  endsAt: number
  summary: string
  notes: Note[]
  artifactIds: string[]
}

export interface ArtifactRecord {
  id: string
  title: string
  kind: 'chart' | 'dataviz' | 'diagram' | 'simulation'
  conceptId: string | null
  startsAt: number | null
  endsAt: number | null
  status: 'built' | 'failed'
  error: string | null
}

export interface LogEntry {
  id: string
  role: 'user' | 'agent'
  text: string
  at: number
  artifactId: string | null
  spoken: boolean
}

export interface Playhead {
  time: number
  state: PlaybackState
}

export interface AgentPresence {
  attached: boolean
  lastSeen: string | null
}

export interface Session {
  id: string
  createdAt: string
  updatedAt: string
  source: Source
  settings: Settings
  userPrompt: string | null
  phase: Phase
  progress: Progress
  error: Failure | null
  transcript: TranscriptRef | null
  concepts: Concept[]
  artifacts: ArtifactRecord[]
  position: Playhead
  agent: AgentPresence
  log: LogEntry[]
  cursor: number
}

/** Objects are merged key by key; arrays and primitives are replaced whole. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

export type SessionPatch = DeepPartial<Session>

export function isPreparing(phase: Phase): boolean {
  return PREPARING_PHASES.includes(phase)
}
