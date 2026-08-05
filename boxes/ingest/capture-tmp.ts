import { Innertube } from 'youtubei.js'
import { writeFile, mkdir } from 'node:fs/promises'

const OUT = process.argv[2]!
const ids = process.argv.slice(3)

await mkdir(OUT, { recursive: true })

const real = globalThis.fetch

for (const id of ids) {
  const calls: { url: string; body: unknown }[] = []
  const spy: typeof fetch = async (input, init) => {
    const res = await real(input as never, init as never)
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    const clone = res.clone()
    const text = await clone.text()
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      /* keep text */
    }
    calls.push({ url, body })
    return res
  }
  try {
    const yt = await Innertube.create({
      fetch: spy,
      lang: 'en',
      generate_session_locally: true,
      retrieve_innertube_config: false,
      retrieve_player: false,
      enable_session_cache: false,
    })
    const info = await yt.getInfo(id, { client: 'IOS' })
    console.error(
      id,
      '| status', info.playability_status?.status,
      '| caps', info.captions?.caption_tracks?.length ?? 0,
      '| emb', info.playability_status?.embeddable,
      '| dur', info.basic_info.duration,
      '| published', JSON.stringify(info.primary_info?.published?.text),
      '| calls', calls.length,
    )
  } catch (e) {
    console.error(id, 'THREW', (e as Error).message, '| calls', calls.length)
  }
  await writeFile(`${OUT}/${id}.json`, JSON.stringify(calls, null, 2))
}
