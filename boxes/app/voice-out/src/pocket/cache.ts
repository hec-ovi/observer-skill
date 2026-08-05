/**
 * Fetch once, keep the bytes, and report what arrives while it arrives.
 *
 * The bundle is 190 MB, so a second session must not pay for it again. The Cache API is
 * keyed by the asset URL: point `baseUrl` at a new build and the old entries simply stop
 * being asked for.
 */

const CACHE_NAME = 'observer.voice-out.pocket.v1'

async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE_NAME)
  } catch {
    // No Cache API (or storage denied): everything still works, it just downloads again.
    return null
  }
}

/** Keep what was downloaded. `put` rejects on a nearly full origin, and that is survivable. */
async function store(
  cache: Cache | null,
  url: string,
  bytes: ArrayBuffer | Uint8Array<ArrayBuffer>,
): Promise<void> {
  try {
    await cache?.put(url, new Response(bytes))
  } catch {
    // Out of room: the bytes are already in hand, so only the next session pays again.
  }
}

/** Bytes for one asset, from the cache when it is there, streamed when it is not. */
export async function fetchAsset(
  url: string,
  onBytes: (received: number) => void,
): Promise<ArrayBuffer> {
  const cache = await openCache()
  const hit = await cache?.match(url)
  if (hit) {
    const bytes = await hit.arrayBuffer()
    onBytes(bytes.byteLength)
    return bytes
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)

  const body = response.body
  if (!body) {
    const bytes = await response.arrayBuffer()
    onBytes(bytes.byteLength)
    await store(cache, url, bytes)
    return bytes
  }

  const reader = body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    size += value.byteLength
    onBytes(value.byteLength)
  }

  const joined = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    joined.set(part, offset)
    offset += part.byteLength
  }
  await store(cache, url, joined)
  return joined.buffer as ArrayBuffer
}
