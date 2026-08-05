/**
 * What every voice-in test needs: a listener with its callbacks recorded, and a way to make
 * the microphone hear something.
 */

import { FakeAudioWorkletNode } from '../../testing/fakes.ts'
import { createListener } from '../src/index.ts'
import type { Diagnostic, Listener, ListenConfig, ListenState } from '../src/index.ts'

const RATE = 16000

export interface Recorded {
  listener: Listener
  heard: string[]
  partials: string[]
  states: ListenState[]
  diagnostics: Diagnostic[]
}

export function recordedListener(config: ListenConfig): Recorded {
  const heard: string[] = []
  const partials: string[] = []
  const states: ListenState[] = []
  const diagnostics: Diagnostic[] = []

  const listener = createListener({
    config,
    onUtterance: (text) => heard.push(text),
    onPartial: (text) => partials.push(text),
    onState: (state) => states.push(state),
    onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
  })

  return { listener, heard, partials, states, diagnostics }
}

/** The worklet delivers this much audio at this level to the open capture. */
export function hear(seconds: number, amplitude: number): void {
  const samples = new Float32Array(Math.round(seconds * RATE)).fill(amplitude)
  FakeAudioWorkletNode.last().port.emit(samples)
}

/**
 * Run a release as far as it goes on its own: the capture torn down, the gate applied, and
 * the request handed to whatever engine is next, which is where the test takes over.
 */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
