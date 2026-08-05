import { readFileSync } from 'node:fs'
import { Innertube } from 'youtubei.js'

const dir = '/home/hec/workspace/observer-skill/boxes/transcript/test/fixtures/innertube'
const load = (n) => readFileSync(`${dir}/${n}.json`, 'utf8')
const calls = []
globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url
  calls.push(url)
  const path = new URL(url).pathname
  const name = path.endsWith('/player') ? 'player' : path.endsWith('/next') ? 'next' : path.endsWith('/get_transcript') ? 'get_transcript' : null
  if (!name) return new Response('nope', { status: 404 })
  return new Response(load(name), { status: 200, headers: { 'content-type': 'application/json' } })
}

const yt = await Innertube.create({ retrieve_player: false, generate_session_locally: true, enable_session_cache: false, fetch: (i, x) => globalThis.fetch(i, x) })
const info = await yt.getInfo('L9NRuLoAQBg')
const t = await info.getTranscript()
const segs = t.transcript.content?.body?.initial_segments ?? []
for (const s of segs) console.error(s.type, JSON.stringify(s.start_ms), JSON.stringify(s.end_ms), s.snippet?.toString())
console.error('languages', t.languages, 'selected', t.selectedLanguage)
console.error('calls', calls)
