/**
 * What a voice is doing while it loads: the stage it is in, and how much has arrived out of
 * what the panel already said it would cost.
 */

import type { WarmProgress } from '@voice-out/index.ts'
import { downloadSize, megabytes } from './voice-catalog.ts'
import './settings.css'

const STEP_LINES: Record<WarmProgress['step'], string> = {
  runtime: 'Loading the engine',
  model: 'Downloading the voice',
  voice: 'Preparing the voice',
  ready: 'Ready to speak',
}

export interface VoiceLoadingProps {
  progress: WarmProgress
}

export function VoiceLoading({ progress: { step, loaded, total } }: VoiceLoadingProps) {
  const line = STEP_LINES[step]
  return (
    <div className="setting-loading">
      <progress className="setting-bar" aria-label={line} value={loaded} max={total} />
      <p className="setting-note">{`${line}: ${megabytes(loaded)} of ${downloadSize(total)}`}</p>
    </div>
  )
}
