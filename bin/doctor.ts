/**
 * What this machine can and cannot do, and what to install to close the gap.
 *
 * Observer works with nothing installed: source resolution and the caption panel both run
 * in-process. The external tools raise the hit rate on captions and unlock the speech
 * recognition fallback, so they are reported as gaps to close, not as failures.
 */

import { execFile } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type { Config } from '#config'

const run = promisify(execFile)

export type Level = 'ok' | 'gap' | 'broken'

export interface Check {
  name: string
  level: Level
  detail: string
  fix?: string
}

const MIN_NODE = [24, 12, 0] as const

function parseVersion(text: string): number[] {
  return text.replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
}

function atLeast(actual: number[], required: readonly number[]): boolean {
  for (const [i, need] of required.entries()) {
    const have = actual[i] ?? 0
    if (have > need) return true
    if (have < need) return false
  }
  return true
}

async function version(bin: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run(bin, args, { timeout: 10_000, encoding: 'utf8' })
    return stdout.trim().split('\n')[0] ?? ''
  } catch {
    return null
  }
}

function checkNode(): Check {
  const actual = parseVersion(process.versions.node)
  if (atLeast(actual, MIN_NODE)) {
    return { name: 'node', level: 'ok', detail: `v${process.versions.node}` }
  }
  return {
    name: 'node',
    level: 'broken',
    detail: `v${process.versions.node}, and TypeScript is only stable from v${MIN_NODE.join('.')}`,
    fix: `Install Node ${MIN_NODE[0]}.${MIN_NODE[1]} or newer.`,
  }
}

async function checkYtDlp(): Promise<Check> {
  const found = await version(process.env['YTDLP_BIN'] ?? 'yt-dlp', ['--version'])
  if (found !== null) return { name: 'yt-dlp', level: 'ok', detail: found }
  return {
    name: 'yt-dlp',
    level: 'gap',
    detail: 'not found, so captions fall back to the transcript panel alone',
    fix: 'Install yt-dlp (a standalone binary is enough) or set YTDLP_BIN to it.',
  }
}

async function checkFfmpeg(config: Config): Promise<Check> {
  const found = await version('ffmpeg', ['-version'])
  if (found !== null) return { name: 'ffmpeg', level: 'ok', detail: found.slice(0, 60) }
  const needed = config.asrUrl !== null
  return {
    name: 'ffmpeg',
    level: needed ? 'broken' : 'gap',
    detail: needed
      ? 'not found, and a transcription endpoint is configured that cannot be fed without it'
      : 'not found, so a video with no captions cannot be transcribed',
    fix: 'Install ffmpeg.',
  }
}

function checkAsr(config: Config): Check {
  if (config.asrUrl !== null) {
    return { name: 'speech recognition', level: 'ok', detail: config.asrUrl }
  }
  return {
    name: 'speech recognition',
    level: 'gap',
    detail: 'no endpoint configured, so a video with no captions cannot be transcribed',
    fix: 'Set OBSERVER_ASR_URL to an OpenAI-compatible transcription endpoint.',
  }
}

async function checkHome(config: Config): Promise<Check> {
  const probe = join(config.home, '.writable')
  try {
    await mkdir(config.home, { recursive: true })
    await writeFile(probe, '')
    await rm(probe)
    return { name: 'data directory', level: 'ok', detail: config.home }
  } catch (error) {
    return {
      name: 'data directory',
      level: 'broken',
      detail: `${config.home} cannot be written: ${(error as Error).message}`,
      fix: 'Fix the permissions, or point OBSERVER_HOME somewhere writable.',
    }
  }
}

function portFree(port: number, bind: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, bind)
  })
}

async function checkPort(config: Config): Promise<Check> {
  const free = await portFree(config.port, config.bind)
  if (free) {
    return { name: 'port', level: 'ok', detail: `${config.bind}:${config.port} is free` }
  }
  return {
    name: 'port',
    level: 'gap',
    detail: `${config.bind}:${config.port} is taken, so the page will open on the next free port`,
  }
}

export async function diagnose(config: Config): Promise<Check[]> {
  return [
    checkNode(),
    await checkHome(config),
    await checkPort(config),
    await checkYtDlp(),
    await checkFfmpeg(config),
    checkAsr(config),
  ]
}

const MARK: Record<Level, string> = { ok: '  ok  ', gap: ' gap  ', broken: 'broken' }

/** Human output. Returns the exit code: non-zero only when something is actually broken. */
export function report(checks: Check[], write: (line: string) => void): number {
  for (const check of checks) {
    write(`[${MARK[check.level]}] ${check.name}: ${check.detail}`)
    if (check.fix !== undefined && check.level !== 'ok') write(`          ${check.fix}`)
  }
  const broken = checks.filter((c) => c.level === 'broken')
  if (broken.length === 0) {
    write('')
    write('Observer can run.')
    return 0
  }
  write('')
  write(`${broken.length} thing${broken.length === 1 ? '' : 's'} must be fixed first.`)
  return 1
}
