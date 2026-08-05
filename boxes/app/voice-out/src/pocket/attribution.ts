/**
 * What the product must display while Pocket TTS is the chosen voice.
 *
 * CC BY 4.0 requires the licensor, a link to the licence, and a statement that the work was
 * modified; the weights here were converted to ONNX and quantized to INT8, which is a
 * modification. The prohibited-use notice comes from the gate on the upstream weights and
 * travels with them.
 */

export const POCKET_ATTRIBUTION = [
  'Speech synthesis by Pocket TTS (https://github.com/kyutai-labs/pocket-tts), (c) Kyutai:',
  'Manu Orsini, Simon Rouard, Gabriel de Marmiesse, Vaclav Volhejn, Neil Zeghidour,',
  'Alexandre Defossez. Model weights licensed CC BY 4.0',
  '(https://creativecommons.org/licenses/by/4.0/); modified: exported to ONNX and quantized',
  'to INT8 by KevinAHM (https://huggingface.co/KevinAHM/pocket-tts-onnx). Built-in voices',
  'from https://huggingface.co/kyutai/tts-voices, licences per voice. Pocket TTS code MIT.',
  'Runtime: ONNX Runtime Web (MIT), SentencePiece (Apache-2.0).',
  '',
  'Use must comply with all applicable laws and must not involve or facilitate any illegal,',
  'harmful, deceptive, fraudulent, or unauthorized activity. Prohibited uses include voice',
  'impersonation or cloning without explicit and lawful consent; misinformation or deception',
  '(fake news, fraudulent calls, presenting generated content as genuine recordings of real',
  'people or events); and unlawful, harmful, libelous, abusive, harassing, discriminatory,',
  'hateful, or privacy-invasive content. All liability disclaimed.',
].join('\n')
