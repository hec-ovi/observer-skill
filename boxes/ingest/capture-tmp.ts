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
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
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
      generate_session_locally: true,
      retrieve_innertube_config: false,
      retrieve_player: false,
      enable_session_cache: false,
    })
    const info = await yt.getBasicInfo(id, { client: process.env['YT_CLIENT'] as never })
    console.error(
      id,
      '|',
      info.basic_info.title,
      '| dur',
      info.basic_info.duration,
      '| captions',
      info.captions?.caption_tracks?.length ?? 0,
      '| embeddable',
      info.playability_status?.embeddable,
      '| status',
      info.playability_status?.status,
      '| reason',
      JSON.stringify(info.playability_status?.reason),
      '| calls',
      calls.length,
    )
  } catch (e) {
    console.error(id, 'THREW', (e as Error).message, '| calls', calls.length)
  }
  await writeFile(`${OUT}/${id}.json`, JSON.stringify(calls, null, 2))
}
