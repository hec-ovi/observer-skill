/**
 * voice-in: hold the button, speak, release, one utterance.
 */

export { createListener } from './listener.ts'
export { LISTEN_ERROR_CODES, ListenError, type ListenErrorCode } from './errors.ts'
export type {
  Diagnostic,
  EngineId,
  Listener,
  ListenConfig,
  ListenerOptions,
  ListenProvider,
  ListenState,
} from '../schema/voice-in.ts'
