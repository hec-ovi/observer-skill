/**
 * A source becomes a transcript on disk.
 *
 * `auto` walks the registry and stops at the first provider that produces text, keeping what
 * each one said so the failure a caller sees names the reason rather than the fact. A named
 * provider is run alone, and its absence is reported as the missing thing to install.
 *
 * A provider that throws instead of answering is a provider that failed: the walk carries on
 * with what it said, so one platform changing its JSON shape does not end the session.
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readConfig } from '#config'
import { fail } from '#errors'
import type { Source } from '#ingest'

import { FFMPEG_DEFAULT } from './asr/audio.ts'
import type { Provider, ProviderContext, ProviderOutcome, ProviderResult } from './provider.ts'
import { broke } from './provider.ts'
import { PROVIDERS, providerById } from './registry.ts'
import type { FetchOptions, ProviderChoice, TranscriptRef } from './schema.ts'
import { FetchOptionsSchema } from './schema.ts'
import { writeTranscript } from './store.ts'
import { YTDLP_DEFAULT } from './ytdlp.ts'

function chosen(option: ProviderChoice | undefined): ProviderChoice {
  if (option !== undefined) return option
  return readConfig().transcript
}

function planFor(choice: ProviderChoice): Provider[] {
  if (choice === 'auto') return PROVIDERS
  const provider = providerById(choice)
  return provider ? [provider] : []
}

/** Whatever the provider does, the walk gets an outcome back. */
async function attempt(
  provider: Provider,
  source: Source,
  context: ProviderContext,
): Promise<ProviderOutcome> {
  try {
    return await provider.fetch(source, context)
  } catch (error) {
    return broke((error as Error).message)
  }
}

function duration(source: Source, result: ProviderResult): number {
  const last = result.segments[result.segments.length - 1]
  return Math.max(last?.end ?? 0, source.duration ?? 0)
}

export async function fetchTranscript(source: Source, options: FetchOptions): Promise<TranscriptRef> {
  const parsed = FetchOptionsSchema.parse(options)
  const report = options.onProgress ?? ((): void => {})
  const choice = chosen(parsed.provider)
  const plan = planFor(choice)

  const scratch = await mkdtemp(join(tmpdir(), 'observer-transcript-'))
  const context: ProviderContext = {
    language: parsed.language,
    file: parsed.file,
    scratch,
    ytdlpBin: parsed.ytdlpBin ?? YTDLP_DEFAULT,
    ffmpegBin: parsed.ffmpegBin ?? FFMPEG_DEFAULT,
    report,
  }

  const notes: string[] = []
  let anyBroke = false
  let produced: { provider: Provider; result: ProviderResult } | null = null

  try {
    for (const provider of plan) {
      const availability = await provider.available(context)
      if (!availability.ok) {
        if (choice !== 'auto') {
          fail(
            'PROVIDER_UNAVAILABLE',
            `The ${provider.id} provider needs ${availability.missing}.`,
            availability.hint,
          )
        }
        notes.push(`${provider.id} needs ${availability.missing}`)
        continue
      }

      const outcome = await attempt(provider, source, context)
      notes.push(`${provider.id}: ${outcome.note}`)
      anyBroke ||= outcome.broke
      if (outcome.result) {
        produced = { provider, result: outcome.result }
        break
      }
    }

    if (!produced) {
      const said = notes.join('; ')
      if (anyBroke) {
        fail(
          'TRANSCRIPT_FAILED',
          'A transcript provider ran and could not produce text.',
          `${said}. Try another provider, or supply a subtitle file with the file option.`,
        )
      }
      fail(
        'NO_TRANSCRIPT',
        'This video publishes no transcript and nothing here can make one.',
        `${said}. Set OBSERVER_ASR_URL to a transcription endpoint, or supply a subtitle file with the file option.`,
      )
    }

    const { provider, result } = produced
    report({
      step: 'transcript',
      done: 0,
      total: result.segments.length,
      message: 'writing the transcript',
    })
    const total = await writeTranscript(
      parsed.home,
      parsed.sessionId,
      {
        provider: provider.id,
        language: result.language,
        generated: result.generated,
        duration: duration(source, result),
      },
      result.segments,
    )
    report({
      step: 'transcript',
      done: total,
      total,
      message: `${total} segments from ${provider.id}`,
    })

    return {
      provider: provider.id,
      language: result.language,
      segmentCount: total,
      duration: duration(source, result),
      generated: result.generated,
    }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}
