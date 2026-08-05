/**
 * The main-thread side of the PCM worklet: a queue, a credit, and a resampler.
 *
 * The processor says how much room its ring buffer has and this sends no more than that, so
 * a model running faster than real time cannot overrun playback. PCM arrives at the model's
 * 24 kHz; if the browser refused that rate for the context, it is resampled on the way in.
 */

import type { AudioHub } from '../audio.ts'
import workletUrl from './pcm-processor.worklet.ts?worker&url'

const PROCESSOR = 'observer-pcm'

/** `addModule` twice on one context fails on the duplicate `registerProcessor`. */
const installed = new WeakSet<BaseAudioContext>()

export interface PlayerEvents {
  /** The first sample reached the speaker. */
  onStarted: () => void
  /** Everything pushed has been played out. */
  onComplete: () => void
}

export class PcmStreamPlayer {
  readonly #node: AudioWorkletNode
  readonly #rate: number
  readonly #events: PlayerEvents
  #queue: Float32Array[] = []
  #room = 0
  #ending = false

  private constructor(node: AudioWorkletNode, rate: number, events: PlayerEvents) {
    this.#node = node
    this.#rate = rate
    this.#events = events
    this.#node.port.onmessage = (event: MessageEvent) => this.#receive(event.data)
  }

  static async open(audio: AudioHub, events: PlayerEvents): Promise<PcmStreamPlayer> {
    const context = audio.context()
    if (!installed.has(context)) {
      await context.audioWorklet.addModule(workletUrl)
      installed.add(context)
    }
    const node = new AudioWorkletNode(context, PROCESSOR, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    })
    node.connect(audio.output().node)
    return new PcmStreamPlayer(node, context.sampleRate, events)
  }

  push(pcm: Float32Array, rate: number): void {
    this.#queue.push(rate === this.#rate ? pcm : resample(pcm, rate, this.#rate))
    this.#flush()
  }

  /** No more audio is coming; `onComplete` follows once the buffer has played out. */
  endStream(): void {
    this.#ending = true
    this.#flush()
  }

  /** Cut what is playing and drop what is queued. The processor fades before it clears. */
  reset(): void {
    this.#queue = []
    this.#ending = false
    this.#room = 0
    this.#node.port.postMessage({ type: 'reset' })
  }

  dispose(): void {
    this.#queue = []
    this.#node.port.onmessage = null
    this.#node.disconnect()
  }

  #flush(): void {
    while (this.#room > 0) {
      const chunk = this.#queue.shift()
      if (!chunk) break
      this.#room -= chunk.length
      this.#node.port.postMessage({ type: 'audio', pcm: chunk }, [chunk.buffer])
    }
    if (this.#ending && this.#queue.length === 0) {
      this.#ending = false
      this.#node.port.postMessage({ type: 'stream-ended' })
    }
  }

  #receive(message: { type: string; room?: number }): void {
    if (message.type === 'capacity') {
      this.#room = message.room ?? 0
      this.#flush()
      return
    }
    if (message.type === 'started') this.#events.onStarted()
    else if (message.type === 'complete') this.#events.onComplete()
  }
}

/** Linear interpolation. Only runs when the browser refused the model's own rate. */
function resample(pcm: Float32Array, from: number, to: number): Float32Array {
  const ratio = to / from
  const out = new Float32Array(Math.round(pcm.length * ratio))
  for (let i = 0; i < out.length; i += 1) {
    const at = i / ratio
    const low = Math.floor(at)
    const rest = at - low
    const a = pcm[low] ?? 0
    const b = pcm[low + 1] ?? a
    out[i] = a + (b - a) * rest
  }
  return out
}
