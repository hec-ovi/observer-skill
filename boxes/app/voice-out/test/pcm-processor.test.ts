/**
 * The PCM worklet's side of the audio thread: it says only the three things the player
 * listens for, so a starved stream cannot flood the main thread with messages nobody reads.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeMessagePort } from '../../testing/fakes.ts'

/** A rate small enough that 130 samples clears the 120 ms start threshold. */
const RATE = 1000
const QUANTUM = 128

interface Processor {
  port: FakeMessagePort
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
}

/** What `AudioWorkletGlobalScope` gives a processor, and nothing else. */
class FakeWorkletProcessor {
  readonly port = new FakeMessagePort()
}

let build: () => Processor

beforeEach(async () => {
  let registered: (new () => Processor) | null = null
  vi.stubGlobal('AudioWorkletProcessor', FakeWorkletProcessor)
  vi.stubGlobal('sampleRate', RATE)
  vi.stubGlobal('registerProcessor', (_name: string, processor: new () => Processor) => {
    registered = processor
  })
  await import('../src/pocket/pcm-processor.worklet.ts')
  build = () => {
    if (!registered) throw new Error('the worklet registered no processor')
    return new registered()
  }
})

function types(port: FakeMessagePort): string[] {
  return port.posted.map((message) => (message as { type: string }).type)
}

describe('the pcm worklet', () => {
  it('tells the player only what the player reads', () => {
    const processor = build()
    processor.port.emit({ type: 'audio', pcm: new Float32Array(130) })

    // Enough buffered to start, then a quantum the buffer cannot fill.
    processor.process([], [[new Float32Array(QUANTUM)]])
    processor.process([], [[new Float32Array(QUANTUM)]])

    processor.port.emit({ type: 'stream-ended' })
    processor.process([], [[new Float32Array(QUANTUM)]])

    expect(types(processor.port)).toEqual(['capacity', 'capacity', 'started', 'complete'])
  })
})
