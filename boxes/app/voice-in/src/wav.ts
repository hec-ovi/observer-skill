/**
 * Samples as a 16-bit WAV. It is the one container every transcription server reads without
 * conversion, and at 16 kHz mono a hold is small enough to post as it is.
 */

const HEADER_BYTES = 44
const BITS = 16

function ascii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
}

export function encodeWav(pcm: Float32Array<ArrayBuffer>, sampleRate: number): Blob {
  const bytes = pcm.length * 2
  const buffer = new ArrayBuffer(HEADER_BYTES + bytes)
  const view = new DataView(buffer)

  ascii(view, 0, 'RIFF')
  view.setUint32(4, 36 + bytes, true)
  ascii(view, 8, 'WAVE')
  ascii(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // fmt chunk size
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, BITS, true)
  ascii(view, 36, 'data')
  view.setUint32(40, bytes, true)

  let offset = HEADER_BYTES
  for (let i = 0; i < pcm.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, pcm[i] ?? 0))
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}
