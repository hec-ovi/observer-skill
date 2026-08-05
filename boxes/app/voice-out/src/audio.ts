/**
 * The box's one AudioContext.
 *
 * Browsers hand a page a suspended context until the user has touched something, so the hub
 * creates it on first use and resumes it on the next gesture as well as on demand. Every
 * provider that owns its audio plays into the same analyser, which is what `onStart` hands
 * the page to draw a level from.
 */

/** The rate the speech models produce. Endpoint audio is resampled into it on decode. */
export const SPEECH_SAMPLE_RATE = 24000

const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const

function openContext(): AudioContext {
  try {
    return new AudioContext({ sampleRate: SPEECH_SAMPLE_RATE, latencyHint: 'interactive' })
  } catch {
    // Safari refuses rates it does not like. The players check `sampleRate` and adapt.
    return new AudioContext()
  }
}

export class AudioHub {
  #context: AudioContext | null = null
  #analyser: AnalyserNode | null = null
  #release: (() => void) | null = null

  /** Created on first use, and the same one for the life of the box. */
  context(): AudioContext {
    const existing = this.#context
    if (existing) return existing
    const context = openContext()
    this.#context = context
    this.#watchForGesture()
    return context
  }

  /** Where a provider connects its source, and the analyser the page reads. */
  output(): { node: AudioNode; analyser: AnalyserNode } {
    const context = this.context()
    let analyser = this.#analyser
    if (!analyser) {
      analyser = context.createAnalyser()
      analyser.connect(context.destination)
      this.#analyser = analyser
    }
    return { node: analyser, analyser }
  }

  async resume(): Promise<void> {
    const context = this.context()
    if (context.state === 'suspended') await context.resume()
  }

  /** Drop the context and the gesture listeners. The next `context()` opens a fresh one. */
  close(): void {
    this.#release?.()
    this.#release = null
    this.#analyser = null
    const context = this.#context
    this.#context = null
    if (context && context.state !== 'closed') void context.close()
  }

  #watchForGesture(): void {
    if (this.#release) return
    const resume = (): void => {
      void this.resume()
    }
    for (const name of GESTURES) {
      addEventListener(name, resume, { capture: true, passive: true })
    }
    this.#release = () => {
      for (const name of GESTURES) removeEventListener(name, resume, { capture: true })
    }
  }
}
