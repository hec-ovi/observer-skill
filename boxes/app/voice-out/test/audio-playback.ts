/**
 * The two AudioContext methods the shared fakes do not carry, because only this box decodes
 * downloaded audio: `decodeAudioData` and `createBufferSource`.
 *
 * The sources are collected so a test can end one the way a real node does, by firing
 * `ended`.
 */

import { FakeAudioContext } from '../../testing/fakes.ts'

export class FakeBufferSource extends EventTarget {
  buffer: unknown = null
  started = false
  stopped = false

  connect<T>(node: T): T {
    return node
  }

  disconnect(): void {}

  start(): void {
    this.started = true
  }

  stop(): void {
    this.stopped = true
    this.finish()
  }

  /** test-side: the buffer played to its end. */
  finish(): void {
    this.dispatchEvent(new Event('ended'))
  }
}

/** Patch the shared AudioContext fake and hand back the list of sources it creates. */
export function installAudioPlayback(): FakeBufferSource[] {
  const sources: FakeBufferSource[] = []
  const context = FakeAudioContext.prototype as unknown as Record<string, unknown>

  context.decodeAudioData = async (bytes: ArrayBuffer): Promise<unknown> => ({
    sampleRate: 24000,
    length: bytes.byteLength,
    numberOfChannels: 1,
    duration: 1,
  })
  context.createBufferSource = (): FakeBufferSource => {
    const source = new FakeBufferSource()
    sources.push(source)
    return source
  }

  return sources
}
