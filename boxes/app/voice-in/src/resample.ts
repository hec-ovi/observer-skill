/**
 * Samples at a different rate, resampled by Web Audio.
 *
 * Only runs when the browser ignored the rate the capture context asked for. Hand-rolled
 * decimation folds everything above the new Nyquist back into the band, which costs real
 * accuracy; the offline context's resampler is filtered.
 */

export async function toRate(
  pcm: Float32Array<ArrayBuffer>,
  from: number,
  to: number,
): Promise<Float32Array<ArrayBuffer>> {
  if (from === to || pcm.length === 0) return pcm

  const offline = new OfflineAudioContext(1, Math.max(1, Math.round((pcm.length / from) * to)), to)
  const buffer = offline.createBuffer(1, pcm.length, from)
  buffer.copyToChannel(pcm, 0)

  const source = offline.createBufferSource()
  source.buffer = buffer
  source.connect(offline.destination)
  source.start()

  const rendered = await offline.startRendering()
  return new Float32Array(rendered.getChannelData(0))
}
