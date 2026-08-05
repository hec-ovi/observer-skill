import { Innertube } from 'youtubei.js'

const yt = await Innertube.create({
  generate_session_locally: true,
  retrieve_innertube_config: false,
  retrieve_player: false,
  enable_session_cache: false,
})

const query = process.argv[2]!
const res = await yt.search(query, { type: 'video' })
const ids: string[] = []
for (const v of res.videos) {
  const id = (v as unknown as { id?: string }).id
  if (id) ids.push(id)
}
console.error('found', ids.length)

for (const id of ids.slice(0, 25)) {
  try {
    const info = await yt.getBasicInfo(id, { client: 'IOS' })
    const caps = info.captions?.caption_tracks?.length ?? 0
    const emb = info.playability_status?.embeddable
    if (caps === 0 || emb === false) {
      console.error(
        'HIT',
        id,
        '| captions',
        caps,
        '| embeddable',
        emb,
        '| status',
        info.playability_status?.status,
        '|',
        info.basic_info.title,
      )
    }
  } catch (e) {
    console.error('err', id, (e as Error).message)
  }
}
