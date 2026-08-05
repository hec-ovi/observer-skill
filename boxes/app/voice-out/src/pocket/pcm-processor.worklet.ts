/**
 * The AudioWorklet that turns a stream of PCM chunks into continuous sound.
 *
 * A ring buffer holds what the model has produced but the speaker has not reached yet.
 * Playback starts at 120 ms buffered, which is under the 240 ms first chunk, so speech
 * begins as soon as the first chunk lands instead of waiting for the second. The main thread
 * is told how much room is left and sends no more than that, so nothing is ever dropped.
 *
 * Cutting a line fades the last 10 ms to zero before clearing, because stopping on a nonzero
 * sample is an audible click.
 */

interface WorkletProcessor {
  readonly port: MessagePort
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean
}

declare const AudioWorkletProcessor: {
  new (): WorkletProcessor
  prototype: WorkletProcessor
}
declare function registerProcessor(name: string, processor: new () => WorkletProcessor): void
declare const sampleRate: number

const RING_SECONDS = 20
const START_SECONDS = 0.12
const FADE_SAMPLES = 240
const CAPACITY_EVERY = 256

class PcmProcessor extends AudioWorkletProcessor {
  readonly #ring: Float32Array
  readonly #start: number
  #read = 0
  #write = 0
  #buffered = 0
  #playing = false
  #ended = false
  #fadeIn = 0
  #fadeOut = 0
  #quanta = 0

  constructor() {
    super()
    this.#ring = new Float32Array(Math.round(sampleRate * RING_SECONDS))
    this.#start = Math.round(sampleRate * START_SECONDS)
    this.port.onmessage = (event: MessageEvent) => this.#receive(event.data)
    this.#reportCapacity()
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channel = outputs[0]?.[0]
    if (!channel) return true
    channel.fill(0)

    this.#quanta += 1
    if (this.#quanta % CAPACITY_EVERY === 0) this.#reportCapacity()

    if (this.#fadeOut > 0) {
      this.#drain(channel, true)
      return true
    }

    if (!this.#playing) {
      if (this.#buffered < this.#start) return true
      this.#playing = true
      this.#fadeIn = FADE_SAMPLES
      this.port.postMessage({ type: 'started' })
    }

    this.#drain(channel, false)

    if (this.#ended && this.#buffered === 0) {
      this.#playing = false
      this.#ended = false
      this.port.postMessage({ type: 'complete' })
    }
    return true
  }

  #drain(channel: Float32Array, fading: boolean): void {
    const wanted = channel.length
    let written = 0

    while (written < wanted && this.#buffered > 0) {
      let sample = this.#ring[this.#read] ?? 0
      if (this.#fadeIn > 0) {
        sample *= (FADE_SAMPLES - this.#fadeIn) / FADE_SAMPLES
        this.#fadeIn -= 1
      }
      if (fading) {
        this.#fadeOut -= 1
        sample *= this.#fadeOut / FADE_SAMPLES
      }

      channel[written] = sample
      this.#read = (this.#read + 1) % this.#ring.length
      this.#buffered -= 1
      written += 1

      if (fading && this.#fadeOut <= 0) break
    }

    if (fading && (this.#fadeOut <= 0 || this.#buffered === 0)) this.#clear()
  }

  #receive(message: { type: string; pcm?: Float32Array }): void {
    if (message.type === 'audio' && message.pcm) {
      this.#append(message.pcm)
      this.#reportCapacity()
      return
    }
    if (message.type === 'stream-ended') {
      this.#ended = true
      return
    }
    if (message.type === 'reset') {
      if (this.#playing && this.#buffered > 0) this.#fadeOut = FADE_SAMPLES
      else this.#clear()
    }
  }

  #append(pcm: Float32Array): void {
    for (const sample of pcm) {
      if (this.#buffered >= this.#ring.length) return
      this.#ring[this.#write] = sample
      this.#write = (this.#write + 1) % this.#ring.length
      this.#buffered += 1
    }
  }

  #clear(): void {
    this.#read = 0
    this.#write = 0
    this.#buffered = 0
    this.#playing = false
    this.#ended = false
    this.#fadeIn = 0
    this.#fadeOut = 0
    this.#reportCapacity()
  }

  #reportCapacity(): void {
    this.port.postMessage({ type: 'capacity', room: this.#ring.length - this.#buffered })
  }
}

registerProcessor('observer-pcm', PcmProcessor)
