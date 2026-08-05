/**
 * Audio for speech recognition: download it, make it 16 kHz mono, cut it into chunks a
 * transcription endpoint will accept.
 *
 * The chunk offsets are read from the segment list ffmpeg writes, never computed from the
 * requested length: ffmpeg cuts on the nearest packet boundary, so a ten-minute chunk starts
 * at 600.016 and every timestamp after it would be wrong by that much.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { ProgressFn } from '../schema.ts'
import { present, run } from '../runner.ts'
import { ytdlp } from '../ytdlp.ts'

export interface Chunk {
  path: string
  /** Where this chunk starts in the video, in seconds. */
  offset: number
}

export function ffmpegBin(): string {
  return process.env['FFMPEG_BIN'] ?? 'ffmpeg'
}

export function ffmpegPresent(): Promise<boolean> {
  return present(ffmpegBin(), ['-version'])
}

export interface AudioFailure {
  error: string
}

/** yt-dlp writes `<id>.<ext>`; the extension follows the format it picked. */
export async function downloadAudio(
  url: string,
  dir: string,
  report: ProgressFn,
): Promise<string | AudioFailure> {
  let total = 0
  const outcome = await ytdlp(
    [
      '--no-playlist',
      '--progress',
      '--newline',
      '--progress-template',
      'download:observer %(progress.downloaded_bytes)s %(progress.total_bytes,progress.total_bytes_estimate)s',
      '-f',
      'bestaudio[acodec=opus]/bestaudio/best',
      '-P',
      dir,
      '-o',
      'audio.%(ext)s',
      '--print',
      'after_move:filepath',
      url,
    ],
    {
      onStdoutLine: (line) => {
        const parts = line.split(' ')
        if (parts[0] !== 'observer') return
        const done = Number(parts[1])
        const size = Number(parts[2])
        if (!Number.isFinite(done)) return
        if (Number.isFinite(size) && size > 0) total = size
        report({
          step: 'audio',
          done: Math.round(done / 1024),
          total: Math.round((total || done) / 1024),
          message: 'downloading audio',
        })
      },
    },
  )

  if (outcome.kind === 'missing') return { error: 'the caption fetcher is not installed' }
  if (outcome.kind === 'failed') return { error: outcome.stderr.split('\n').slice(-3).join(' ').trim() }

  const path = outcome.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('observer '))
    .pop()
  if (!path) return { error: 'the audio download wrote no file' }
  return path
}

/** `<file>,<start>,<end>`. The end column is only read to know the row is a real one. */
function parseSegmentList(csv: string): Chunk[] {
  const rows: Chunk[] = []
  for (const line of csv.split('\n')) {
    const [name, from, to] = line.trim().split(',')
    if (!name || from === undefined || to === undefined) continue
    const offset = Number(from)
    if (!Number.isFinite(offset) || !Number.isFinite(Number(to))) continue
    rows.push({ path: name, offset })
  }
  return rows
}

/** One ffmpeg pass: resample to what recognizers want, and cut on the way out. */
export async function splitAudio(
  input: string,
  dir: string,
  chunkSeconds: number,
): Promise<Chunk[] | AudioFailure> {
  const list = join(dir, 'chunks.csv')
  const outcome = await run(ffmpegBin(), [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    input,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    '-f',
    'segment',
    '-segment_time',
    String(chunkSeconds),
    '-reset_timestamps',
    '1',
    '-segment_list',
    list,
    '-segment_list_type',
    'csv',
    join(dir, 'chunk_%03d.wav'),
  ])

  if (outcome.kind === 'missing') return { error: 'ffmpeg is not installed' }
  if (outcome.kind === 'failed') return { error: outcome.stderr.split('\n').slice(-2).join(' ').trim() }

  const csv = await readFile(list, 'utf8').catch(() => '')
  const chunks = parseSegmentList(csv).map((chunk) => ({ ...chunk, path: join(dir, chunk.path) }))
  if (chunks.length === 0) return { error: 'ffmpeg produced no audio chunks' }
  return chunks
}
