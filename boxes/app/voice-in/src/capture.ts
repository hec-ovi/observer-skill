/**
 * The microphone for one hold: open the device, keep the samples, hand back the recording,
 * and let go of the device on the way out.
 *
 * Samples rather than an encoded blob, because every provider wants them: the local model
 * takes Float32 PCM directly, the endpoint takes a WAV built from the same samples, and the
 * peak the gate needs comes with them for free.
 */

import workletUrl from './pcm.worklet.ts?worker&url'
import { EngineFailure, ListenError, messageOf, nameOf } from './errors.ts'
import { toRate } from './resample.ts'

export const TARGET_RATE = 16000
const PROCESSOR = 'pcm-capture'

/** Denied for good, versus worth another press. */
const DENIALS = new Set(['NotAllowedError', 'SecurityError'])

export interface Recording {
  /** Mono samples in [-1, 1] at `sampleRate`. */
  pcm: Float32Array<ArrayBuffer>
  sampleRate: number
  seconds: number
  peak: number
  /** The input device as the browser names it. */
  device: string
}

/** Whether there is a microphone to ask for at all. Absent means an insecure origin. */
export function microphoneReachable(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function'
}

function fail(error: unknown): never {
  const name = nameOf(error)
  if (DENIALS.has(name)) throw new ListenError('MIC_DENIED', 'the microphone was refused')
  throw new EngineFailure(name || messageOf(error))
}

function peakOf(pcm: Float32Array<ArrayBuffer>): number {
  let peak = 0
  for (let i = 0; i < pcm.length; i += 1) {
    const sample = pcm[i] ?? 0
    const level = sample < 0 ? -sample : sample
    if (level > peak) peak = level
  }
  return peak
}

function join(chunks: Float32Array[]): Float32Array<ArrayBuffer> {
  let total = 0
  for (const chunk of chunks) total += chunk.length
  const pcm = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    pcm.set(chunk, offset)
    offset += chunk.length
  }
  return pcm
}

interface Graph {
  stream: MediaStream
  context: AudioContext
  source: MediaStreamAudioSourceNode
  node: AudioWorkletNode
  sink: GainNode
}

export class MicCapture {
  #graph: Graph
  #chunks: Float32Array[] = []
  #closed: Promise<Recording> | null = null

  constructor(graph: Graph) {
    this.#graph = graph
    graph.node.port.onmessage = (event: MessageEvent) => {
      this.#chunks.push(event.data as Float32Array)
    }
  }

  /** Release the device and report what it heard. Safe to call twice. */
  close = (): Promise<Recording> => {
    this.#closed ??= this.#teardown()
    return this.#closed
  }

  async #teardown(): Promise<Recording> {
    const { stream, context, source, node, sink } = this.#graph
    node.port.onmessage = null
    source.disconnect()
    node.disconnect()
    sink.disconnect()
    for (const track of stream.getTracks()) track.stop()
    await context.close()

    const captured = join(this.#chunks)
    this.#chunks = []
    const pcm = await toRate(captured, context.sampleRate, TARGET_RATE)

    return {
      pcm,
      sampleRate: TARGET_RATE,
      seconds: pcm.length / TARGET_RATE,
      peak: peakOf(pcm),
      device: stream.getAudioTracks()[0]?.label || 'default',
    }
  }
}

/**
 * One microphone session. Echo cancellation stays on because the page speaks its answers out
 * loud and would otherwise transcribe itself.
 */
export async function openMicrophone(): Promise<MicCapture> {
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      video: false,
    })
  } catch (error) {
    fail(error)
  }

  let context: AudioContext | null = null
  try {
    // Asking the context for 16 kHz makes the browser resample the microphone for us; the
    // rate is a request, so `MicCapture` checks what it got.
    context = new AudioContext({ sampleRate: TARGET_RATE })
    if (context.state === 'suspended') await context.resume()
    await context.audioWorklet.addModule(workletUrl)

    const source = context.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(context, PROCESSOR)
    const sink = context.createGain()
    // Silent, but a worklet whose output goes nowhere is not pulled in Chrome.
    sink.gain.value = 0
    source.connect(node)
    node.connect(sink)
    sink.connect(context.destination)

    return new MicCapture({ stream, context, source, node, sink })
  } catch (error) {
    for (const track of stream.getTracks()) track.stop()
    await context?.close()
    fail(error)
  }
}
