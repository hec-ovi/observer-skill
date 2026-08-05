/**
 * SentencePiece, loaded as an ES module at runtime and fed the bundle's `tokenizer.model`.
 *
 * The module inlines its own wasm as base64, so there is no second binary to fetch, and it
 * takes the model as base64 too. The conversion is chunked: spreading 59,000 bytes into
 * `String.fromCharCode` works today and throws on the next larger tokenizer.
 */

const CHUNK = 0x8000

interface SentencePieceProcessor {
  loadFromB64StringModel(model: string): Promise<void>
  encodeIds(text: string): number[]
  decodeIds(ids: number[]): string
}

interface SentencePieceModule {
  SentencePieceProcessor: new () => SentencePieceProcessor
}

export interface Tokenizer {
  encode(text: string): number[]
  decode(ids: number[]): string
}

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let text = ''
  for (let offset = 0; offset < view.length; offset += CHUNK) {
    text += String.fromCharCode(...view.subarray(offset, offset + CHUNK))
  }
  return btoa(text)
}

export async function loadTokenizer(moduleUrl: string, model: ArrayBuffer): Promise<Tokenizer> {
  const loaded = (await import(/* @vite-ignore */ moduleUrl)) as SentencePieceModule
  const processor = new loaded.SentencePieceProcessor()
  await processor.loadFromB64StringModel(toBase64(model))
  return {
    encode: (text) => processor.encodeIds(text),
    decode: (ids) => processor.decodeIds(ids),
  }
}
