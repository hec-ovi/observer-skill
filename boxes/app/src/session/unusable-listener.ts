/**
 * The listener for a configuration no engine can run.
 *
 * It hears nothing and reports why, so the question box points at the settings control that
 * fixes it instead of throwing out of a mount.
 */

import type { HoldHandlers } from '@dialogue/index.ts'
import type { Listener } from '@voice-in/index.ts'

export function unusableListener(reason: string, handlers: HoldHandlers): Listener {
  return {
    supported: false,
    engine: null,
    state: 'unavailable',
    reason,
    async start(): Promise<void> {
      handlers.onState('unavailable')
    },
    async stop(): Promise<void> {},
    setLanguage(): void {},
    dispose(): void {},
  }
}
