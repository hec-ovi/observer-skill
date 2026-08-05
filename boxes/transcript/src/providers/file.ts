/**
 * A subtitle file the user already has. Whatever the platform says, this wins when it is
 * given, because the user brought the words themselves.
 */

import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'

import { parseSubtitles } from '../formats/subtitles.ts'
import { cuesToSegments } from '../normalize.ts'
import type { Availability, Provider, ProviderContext, ProviderOutcome } from '../provider.ts'
import { nothing, produced } from '../provider.ts'

const ACCEPTED = new Set(['.srt', '.vtt'])

export const file: Provider = {
  id: 'file',

  async available(context: ProviderContext): Promise<Availability> {
    if (context.file === undefined) {
      return {
        ok: false,
        missing: 'a subtitle file',
        hint: 'Pass file with the path to an SRT or VTT to use this provider.',
      }
    }
    const found = await stat(context.file).then(
      (entry) => entry.isFile(),
      () => false,
    )
    if (found) return { ok: true }
    return {
      ok: false,
      missing: context.file,
      hint: 'Pass file with the path to an SRT or VTT that exists.',
    }
  },

  async fetch(_source, context: ProviderContext): Promise<ProviderOutcome> {
    if (context.file === undefined) return nothing('no subtitle file was supplied')
    const extension = extname(context.file).toLowerCase()
    if (!ACCEPTED.has(extension)) {
      return nothing(`${extension || 'that file'} is not an SRT or VTT`)
    }

    context.report({ step: 'file', done: 0, total: 1, message: `reading ${extension.slice(1)}` })
    const parsed = parseSubtitles(await readFile(context.file, 'utf8'))
    const segments = cuesToSegments(parsed.cues, { dedupeOverlap: parsed.rolling })
    context.report({ step: 'file', done: 1, total: 1, message: `read ${segments.length} segments` })

    if (segments.length === 0) return nothing('the subtitle file holds no cues')
    return produced(
      { segments, language: context.language ?? 'unknown', generated: false },
      `${segments.length} segments from ${context.file}`,
    )
  },
}
