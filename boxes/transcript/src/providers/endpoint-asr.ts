/**
 * Speech recognition, for a video that publishes no captions at all.
 *
 * Audio comes down once, becomes 16 kHz mono, and is cut into chunks the endpoint accepts.
 * Each chunk is sent on its own and stitched back with the offset ffmpeg reported, so a
 * three-hour podcast arrives on one timeline. Progress counts chunks, which is the part
 * that actually takes the time.
 */

import { readConfig } from '#config'
import type { Source } from '#ingest'

import { downloadAudio, ffmpegPresent, splitAudio } from '../asr/audio.ts'
import { transcribeChunk } from '../asr/transcribe.ts'
import type { Cue } from '../normalize.ts'
import { cuesToSegments } from '../normalize.ts'
import type { Availability, Provider, ProviderContext, ProviderOutcome } from '../provider.ts'
import { broke, nothing, produced } from '../provider.ts'
import { YTDLP_INSTALL, ytdlpPresent } from '../ytdlp.ts'

/** Ten minutes keeps a 16 kHz mono chunk under the size limits these routes publish. */
const CHUNK_SECONDS = 600
/** How much of the previous chunk is handed over to steady names across the seam. */
const PROMPT_CHARS = 220

export const endpointAsr: Provider = {
  id: 'endpoint-asr',

  async available(context: ProviderContext): Promise<Availability> {
    const config = readConfig()
    if (config.asrUrl === null) {
      return {
        ok: false,
        missing: 'a transcription endpoint',
        hint: 'Set OBSERVER_ASR_URL to an OpenAI-compatible transcription endpoint.',
      }
    }
    if (!(await ytdlpPresent(context.ytdlpBin))) {
      return { ok: false, missing: 'yt-dlp', hint: YTDLP_INSTALL }
    }
    if (!(await ffmpegPresent(context.ffmpegBin))) {
      return { ok: false, missing: 'ffmpeg', hint: 'Install ffmpeg, or set FFMPEG_BIN to it.' }
    }
    return { ok: true }
  },

  async fetch(source: Source, context: ProviderContext): Promise<ProviderOutcome> {
    const config = readConfig()
    if (config.asrUrl === null) return nothing('no transcription endpoint is configured')

    context.report({ step: 'audio', done: 0, total: 1, message: 'downloading audio' })
    const audio = await downloadAudio(source.url, context.scratch, context.report, context.ytdlpBin)
    if (typeof audio !== 'string') return broke(audio.error)

    context.report({ step: 'chunks', done: 0, total: 1, message: 'preparing audio' })
    const chunks = await splitAudio(audio, context.scratch, CHUNK_SECONDS, context.ffmpegBin)
    if (!Array.isArray(chunks)) return broke(chunks.error)
    context.report({ step: 'chunks', done: 1, total: 1, message: `${chunks.length} chunks to transcribe` })

    const cues: Cue[] = []
    let language = context.language ?? null
    let prompt: string | undefined

    for (const [index, chunk] of chunks.entries()) {
      context.report({
        step: 'transcribe',
        done: index,
        total: chunks.length,
        message: `transcribing chunk ${index + 1} of ${chunks.length}`,
      })
      const answer = await transcribeChunk(chunk.path, chunk.offset, {
        url: config.asrUrl,
        key: config.asrKey,
        model: config.asrModel,
        language: context.language,
        prompt,
      })
      if ('error' in answer) return broke(answer.error)
      cues.push(...answer.cues)
      language ??= answer.language
      prompt = answer.cues
        .map((cue) => cue.text)
        .join(' ')
        .slice(-PROMPT_CHARS)
    }

    context.report({
      step: 'transcribe',
      done: chunks.length,
      total: chunks.length,
      message: 'stitching the chunks together',
    })

    cues.sort((a, b) => a.start - b.start)
    const segments = cuesToSegments(cues)
    if (segments.length === 0) return broke('the transcription endpoint returned no text')

    return produced(
      { segments, language: language ?? 'unknown', generated: true },
      `${segments.length} segments from ${chunks.length} audio chunks`,
    )
  },
}
