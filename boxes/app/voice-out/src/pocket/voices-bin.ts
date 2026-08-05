/**
 * `voices.bin`, format `PTVB1`: the FlowLM state that makes a voice sound like itself.
 *
 * Little-endian throughout. Each voice holds one `cache` and one `offset` per transformer
 * layer, and picking a built-in voice is pure data reshaping: no model runs.
 *
 *   magic "PTVB1", u32 voice_count,
 *   per voice: u16 name_len, name, u16 tensor_count,
 *   per tensor: u16 key_len, key, u8 dtype (0 f32, 1 i64, 2 bool), u8 rank,
 *               rank x u32 shape, u32 byte_len, data in C order
 */

export type VoiceTensorData = Float32Array | BigInt64Array | Uint8Array

export interface VoiceTensor {
  data: VoiceTensorData
  shape: number[]
}

/** Voice name to `<module>/<key>` to tensor. */
export type VoiceRecords = Record<string, Record<string, VoiceTensor>>

const MAGIC = 'PTVB1'

export function parseVoiceStates(buffer: ArrayBuffer): VoiceRecords {
  const view = new DataView(buffer)
  const decoder = new TextDecoder()
  let offset = 0

  if (decoder.decode(new Uint8Array(buffer, offset, MAGIC.length)) !== MAGIC) {
    throw new Error('voices.bin is not a PTVB1 file')
  }
  offset += MAGIC.length

  const voices: VoiceRecords = {}
  const voiceCount = view.getUint32(offset, true)
  offset += 4

  for (let v = 0; v < voiceCount; v += 1) {
    const nameLength = view.getUint16(offset, true)
    offset += 2
    const name = decoder.decode(new Uint8Array(buffer, offset, nameLength))
    offset += nameLength

    const tensorCount = view.getUint16(offset, true)
    offset += 2
    const tensors: Record<string, VoiceTensor> = {}

    for (let t = 0; t < tensorCount; t += 1) {
      const keyLength = view.getUint16(offset, true)
      offset += 2
      const key = decoder.decode(new Uint8Array(buffer, offset, keyLength))
      offset += keyLength

      const dtype = view.getUint8(offset)
      offset += 1
      const rank = view.getUint8(offset)
      offset += 1

      const shape: number[] = []
      for (let d = 0; d < rank; d += 1) {
        shape.push(view.getUint32(offset, true))
        offset += 4
      }

      const byteLength = view.getUint32(offset, true)
      offset += 4
      const slice = buffer.slice(offset, offset + byteLength)
      offset += byteLength

      tensors[key] = { data: toTypedArray(dtype, slice), shape }
    }

    voices[name] = tensors
  }

  return voices
}

function toTypedArray(dtype: number, slice: ArrayBuffer): VoiceTensorData {
  if (dtype === 0) return new Float32Array(slice)
  if (dtype === 1) return new BigInt64Array(slice)
  if (dtype === 2) return new Uint8Array(slice)
  throw new Error(`voices.bin has an unknown dtype code ${dtype}`)
}
