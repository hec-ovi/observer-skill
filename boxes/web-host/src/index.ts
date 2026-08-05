/**
 * web-host: the HTTP half of the process. It serves the built app, answers the REST face,
 * carries the live channel to and from the page, and hosts the document verification runs a
 * module in.
 */

export { createHost } from './host.ts'
export type { Host, HostOptions, VerifyRequest } from './host.ts'

export type { CreateSession, ReadTranscript, SessionPort } from './session-port.ts'

export { upstreamEventSchema, verifyOutcomeSchema } from './schema.ts'
export type {
  CreateSessionInput,
  TranscriptQuery,
  UpstreamEvent,
  VerifyResult,
} from './schema.ts'
