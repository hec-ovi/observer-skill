import { Innertube } from 'youtubei.js'

const yt = await Innertube.create({
  generate_session_locally: true,
  retrieve_innertube_config: false,
  retrieve_player: false,
  enable_session_cache: false,
})

for (const id of process.argv.slice(2)) {
  try {
    const info = await yt.getInfo(id, { client: 'IOS' })
    console.error(
      id,
      '| status', info.playability_status?.status,
      '| caps', info.captions?.caption_tracks?.length ?? 0,
      '| emb', info.playability_status?.embeddable,
      '| dur', info.basic_info.duration,
      '| published', JSON.stringify(info.primary_info?.published?.text),
      '| relative', JSON.stringify(info.primary_info?.relative_date?.text),
    )
  } catch (e) {
    console.error(id, 'THREW', (e as Error).message)
  }
}
