import { readFile, writeFile } from 'node:fs/promises'

type Call = { url: string; body: Record<string, unknown> }

const src = process.argv[2]!
const dst = process.argv[3]!

const calls = JSON.parse(await readFile(src, 'utf8')) as Call[]

const out = calls.map((call) => {
  if (call.url.includes('/player')) {
    const b = call.body
    const kept: Record<string, unknown> = {}
    for (const k of ['playabilityStatus', 'videoDetails', 'captions']) {
      if (k in b) kept[k] = b[k]
    }
    return { url: call.url, body: kept }
  }
  const results = (
    call.body as {
      contents?: {
        twoColumnWatchNextResults?: { results?: { results?: { contents?: unknown[] } } }
      }
    }
  ).contents?.twoColumnWatchNextResults?.results?.results?.contents
  const primary = results?.filter((c) => Object.hasOwn(c as object, 'videoPrimaryInfoRenderer'))
  if (!primary || primary.length === 0) return { url: call.url, body: {} }
  return {
    url: call.url,
    body: {
      contents: { twoColumnWatchNextResults: { results: { results: { contents: primary } } } },
    },
  }
})

await writeFile(dst, JSON.stringify(out, null, 2))
console.error(dst, JSON.stringify(out).length)
