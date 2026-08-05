/**
 * The capture processor. It copies every render quantum of the microphone's first channel
 * back to the main thread and nothing else: no gating, no analysis, no buffering.
 *
 * Runs inside `AudioWorkletGlobalScope`, which has none of the DOM, so the types it needs
 * are declared here rather than imported.
 */

interface WorkletProcessor {
  readonly port: MessagePort
}

declare const AudioWorkletProcessor: {
  new (): WorkletProcessor
  prototype: WorkletProcessor
}

declare function registerProcessor(
  name: string,
  processor: new () => WorkletProcessor & { process(inputs: Float32Array[][]): boolean },
): void

class PcmCapture extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    // The input array is reused between quanta, so the copy is not optional.
    if (channel && channel.length > 0) this.port.postMessage(channel.slice(0))
    // Returning false would tear the processor down for good.
    return true
  }
}

registerProcessor('pcm-capture', PcmCapture)
