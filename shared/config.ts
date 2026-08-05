/**
 * Every setting the process reads from its environment, resolved once, with defaults that
 * work unset. No path from a home directory is written anywhere else in the codebase.
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

export interface Config {
  /** First port to try for the page. Taken ports move up one at a time. */
  port: number
  /** Address to listen on. Loopback unless the user asked for more. */
  bind: string
  /** Where sessions, transcripts, artifacts, and snapshots live. */
  home: string
  /** Transcript provider: 'auto' picks captions, then the ASR endpoint. */
  transcript: 'auto' | 'captions' | 'endpoint-asr' | 'file'
  /** OpenAI-compatible transcription endpoint, for videos with no captions. */
  asrUrl: string | null
  asrKey: string | null
  asrModel: string
  /** Open the page in the user's browser when a session starts. */
  openBrowser: boolean
  /** Where the agent's prompt files are read from. Null means the install's own folder. */
  prompts: string | null
  /** The caption fetcher binary, found on PATH unless a path is given. */
  ytdlpBin: string
  /** The audio converter speech recognition feeds its chunks through. */
  ffmpegBin: string
}

function int(value: string | undefined, fallback: number): number {
  const n = value === undefined ? NaN : Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : fallback
}

function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase())
}

/** An empty variable is an unset one: `VAR=` in a shell must not name the empty path. */
function path(value: string | undefined): string | null {
  return value === undefined || value.length === 0 ? null : value
}

function defaultHome(env: NodeJS.ProcessEnv): string {
  const xdg = env['XDG_DATA_HOME']
  if (xdg && xdg.length > 0) return join(xdg, 'observer')
  return join(homedir(), '.local', 'share', 'observer')
}

const TRANSCRIPT_PROVIDERS = ['auto', 'captions', 'endpoint-asr', 'file'] as const

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const declared = env['OBSERVER_TRANSCRIPT']
  const transcript = TRANSCRIPT_PROVIDERS.find((p) => p === declared) ?? 'auto'

  return {
    port: int(env['OBSERVER_PORT'], 4830),
    bind: env['OBSERVER_BIND'] ?? '127.0.0.1',
    home: env['OBSERVER_HOME'] ?? defaultHome(env),
    transcript,
    asrUrl: env['OBSERVER_ASR_URL'] ?? null,
    asrKey: env['OBSERVER_ASR_KEY'] ?? null,
    asrModel: env['OBSERVER_ASR_MODEL'] ?? 'whisper-1',
    openBrowser: flag(env['OBSERVER_OPEN'], true),
    prompts: path(env['OBSERVER_PROMPTS']),
    ytdlpBin: env['YTDLP_BIN'] ?? 'yt-dlp',
    ffmpegBin: env['FFMPEG_BIN'] ?? 'ffmpeg',
  }
}
