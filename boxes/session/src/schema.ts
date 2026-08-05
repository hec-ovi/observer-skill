import * as z from 'zod/v4'
import { ERROR_CODES } from '#errors'
import { newId } from './ids.ts'

/**
 * The whole record shape, in one place. Every write goes through `sessionSchema`, so a new
 * field is one line here plus a default.
 *
 * Optional fields are spelled `null`, never absent, so the JSON on disk round-trips back to
 * exactly the object that was written.
 */

/** Safe as a path segment and as a URL segment. Ids that reach the filesystem use this. */
const safeId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'must be safe as a path and URL segment')
  .refine((v) => v !== '.' && v !== '..', 'must not be a directory reference')

/** A free-form id that never reaches the filesystem. */
const plainId = z.string().min(1).max(128)

/** A path stored relative to `home`, written with forward slashes. */
const homeRelativePath = z
  .string()
  .min(1)
  .refine(
    (p) => !p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p) && !p.split(/[\\/]/).includes('..'),
    'must be relative to home and must not climb out of it',
  )

const isoDate = z.iso.datetime()

export const PHASES = ['feed', 'transcribing', 'researching', 'building', 'ready', 'live'] as const
export const phaseSchema = z.enum(PHASES)
export type Phase = z.infer<typeof phaseSchema>

/**
 * The video, exactly as `ingest` resolved it. Everything it learned is kept: the research
 * pass compares `publishedAt` against today to find what has moved since the recording,
 * and `hasCaptions` decides which transcript provider runs first.
 */
export const sourceSchema = z.object({
  provider: z.string().min(1),
  videoId: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  channel: z.string().default(''),
  duration: z.number().min(0).nullable().default(null),
  /** `YYYY-MM-DD`, or null when only the keyless lookup answered. */
  publishedAt: z.string().nullable().default(null),
  /** Null when unknown, so "no captions" is never guessed. */
  hasCaptions: z.boolean().nullable().default(null),
  captionLanguages: z.array(z.string()).default([]),
  hasAds: z.boolean().default(false),
  embeddable: z.boolean().default(true),
  /** True when only the keyless lookup answered, so the fields above may be unknown. */
  degraded: z.boolean().default(false),
})
export type Source = z.infer<typeof sourceSchema>

export const themeSchema = z.enum(['light', 'dark', 'system'])
export const voiceOutProviderSchema = z.enum(['pocket', 'web-speech', 'endpoint'])
export const voiceInProviderSchema = z.enum(['web-speech', 'whisper-web', 'endpoint'])

export const settingsSchema = z
  .object({
    theme: themeSchema.default('system'),
    language: z.string().min(1).default('en'),
    extraKnowledge: z.boolean().default(true),
    toolkit: z.boolean().default(true),
    voiceOut: z
      .object({
        provider: voiceOutProviderSchema.default('web-speech'),
        voice: z.string().nullable().default(null),
      })
      .prefault({}),
    voiceIn: z
      .object({
        provider: voiceInProviderSchema.default('web-speech'),
        endpoint: z.string().nullable().default(null),
      })
      .prefault({}),
  })
  .prefault({})
export type Settings = z.infer<typeof settingsSchema>

/** What the page sends when the user changes a setting: only the fields they touched. */
export const settingsPatchSchema = z.object({
  theme: themeSchema.optional(),
  language: z.string().min(1).optional(),
  extraKnowledge: z.boolean().optional(),
  toolkit: z.boolean().optional(),
  voiceOut: z
    .object({
      provider: voiceOutProviderSchema.optional(),
      voice: z.string().nullable().optional(),
    })
    .optional(),
  voiceIn: z
    .object({
      provider: voiceInProviderSchema.optional(),
      endpoint: z.string().nullable().optional(),
    })
    .optional(),
})
export type SettingsPatch = z.infer<typeof settingsPatchSchema>

const progressFields = z.object({
  step: z.string().default(''),
  done: z.number().min(0).default(0),
  total: z.number().min(0).default(0),
  message: z.string().default(''),
})
export const progressSchema = progressFields.prefault({})
export type Progress = z.infer<typeof progressSchema>
/** What a caller may send: the fields it knows, merged over the ones already there. */
export type ProgressInput = z.input<typeof progressFields>

export const sessionErrorSchema = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string(),
  hint: z.string().default(''),
})
export type SessionError = z.infer<typeof sessionErrorSchema>
export type SessionErrorInput = z.input<typeof sessionErrorSchema>

export const transcriptRefSchema = z.object({
  provider: z.string().min(1),
  language: z.string().min(1),
  segmentCount: z.number().int().min(0),
  duration: z.number().min(0),
})
export type TranscriptRef = z.infer<typeof transcriptRefSchema>

export const noteSchema = z.object({
  id: plainId.default(() => newId()),
  kind: z.enum(['background', 'current']),
  text: z.string().min(1),
  source: z.string().nullable().default(null),
  addedAt: isoDate.default(() => new Date().toISOString()),
})
export type Note = z.infer<typeof noteSchema>
export type NoteInput = z.input<typeof noteSchema>

export const conceptSchema = z.object({
  id: plainId,
  label: z.string().min(1),
  kind: z.enum(['definition', 'equation', 'system', 'jargon']),
  startsAt: z.number().min(0),
  endsAt: z.number().min(0),
  summary: z.string().default(''),
  notes: z.array(noteSchema).default([]),
  artifactIds: z.array(safeId).default([]),
})
export type Concept = z.infer<typeof conceptSchema>
export type ConceptInput = z.input<typeof conceptSchema>

export const artifactSchema = z.object({
  id: safeId,
  title: z.string().min(1),
  kind: z.enum(['chart', 'dataviz', 'diagram', 'simulation']),
  conceptId: plainId.nullable().default(null),
  startsAt: z.number().min(0).nullable().default(null),
  endsAt: z.number().min(0).nullable().default(null),
  status: z.enum(['built', 'failed']),
  bundlePath: homeRelativePath,
  snapshotPath: homeRelativePath.nullable().default(null),
  error: z.string().nullable().default(null),
})
export type Artifact = z.infer<typeof artifactSchema>
export type ArtifactInput = z.input<typeof artifactSchema>

export const logEntrySchema = z.object({
  id: plainId.default(() => newId()),
  role: z.enum(['user', 'agent']),
  text: z.string(),
  at: z.number().min(0),
  artifactId: safeId.nullable().default(null),
  spoken: z.boolean().default(false),
})
export type LogEntry = z.infer<typeof logEntrySchema>
export type LogEntryInput = z.input<typeof logEntrySchema>

export const positionSchema = z
  .object({
    time: z.number().min(0).default(0),
    state: z.enum(['idle', 'playing', 'paused', 'buffering', 'ended']).default('idle'),
  })
  .prefault({})
export type Position = z.infer<typeof positionSchema>

export const agentSchema = z
  .object({
    attached: z.boolean().default(false),
    lastSeen: isoDate.nullable().default(null),
  })
  .prefault({})
export type Agent = z.infer<typeof agentSchema>

export const sessionSchema = z.object({
  id: safeId,
  createdAt: isoDate,
  updatedAt: isoDate,
  source: sourceSchema,
  settings: settingsSchema,
  userPrompt: z.string().nullable().default(null),
  phase: phaseSchema.default('feed'),
  progress: progressSchema,
  error: sessionErrorSchema.nullable().default(null),
  transcript: transcriptRefSchema.nullable().default(null),
  concepts: z.array(conceptSchema).default([]),
  artifacts: z.array(artifactSchema).default([]),
  position: positionSchema,
  agent: agentSchema,
  log: z.array(logEntrySchema).default([]),
  cursor: z.number().int().min(0).default(0),
})
export type Session = z.infer<typeof sessionSchema>

export const newSessionInputSchema = z.object({
  source: sourceSchema,
  settings: settingsSchema,
  userPrompt: z.string().nullable().default(null),
})
export type NewSessionInput = z.input<typeof newSessionInputSchema>

/** Inbox events, as the page and the CLI push them. `cursor` is assigned by the store. */
export const inboxEventInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ask'),
    at: z.number().min(0).default(0),
    text: z.string().min(1),
    via: z.enum(['text', 'voice']).default('text'),
  }),
  z.object({ kind: z.literal('pause'), at: z.number().min(0).default(0) }),
  z.object({ kind: z.literal('seek'), at: z.number().min(0).default(0) }),
  z.object({
    kind: z.literal('settings'),
    at: z.number().min(0).default(0),
    settings: settingsPatchSchema,
  }),
  z.object({ kind: z.literal('ready'), at: z.number().min(0).default(0) }),
])
export type InboxEventInput = z.input<typeof inboxEventInputSchema>
export type InboxEvent = z.infer<typeof inboxEventInputSchema> & { readonly cursor: number }

/** Transient messages to the open page. Never persisted. */
export const signalSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('say'),
    entryId: plainId,
    text: z.string(),
    speak: z.boolean().default(false),
    artifactId: safeId.nullable().default(null),
  }),
  z.object({ type: z.literal('show'), artifactId: safeId }),
  z.object({ type: z.literal('hide') }),
  z.object({
    type: z.literal('verify'),
    requestId: plainId,
    url: z.string().min(1),
    timeoutMs: z.number().int().positive(),
  }),
])
export type Signal = z.infer<typeof signalSchema>
export type SignalInput = z.input<typeof signalSchema>

/** Objects are merged key by key; arrays and primitives are replaced whole. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

/** What a subscriber receives: only the part of the record that moved. */
export type SessionDiff = DeepPartial<Session>

/** The fields a caller may patch. Ids, timestamps, the cursor, the phase and agent presence
 * belong to the store and move through their own calls. */
export type SessionPatch = DeepPartial<
  Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'cursor' | 'phase' | 'agent'>
>

export const STORE_OWNED_KEYS = ['id', 'createdAt', 'updatedAt', 'cursor', 'phase', 'agent'] as const

export type SubscriberMessage =
  | { type: 'patch'; patch: SessionDiff }
  | { type: 'phase'; phase: Phase; progress: Progress }
  | { type: 'signal'; signal: Signal }

export type Subscriber = (message: SubscriberMessage) => void
