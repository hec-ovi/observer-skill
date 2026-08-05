/**
 * The caption fetcher binary. The caller names it; `yt-dlp` on PATH is the default.
 *
 * A JavaScript runtime is mandatory for this extractor now, and Node is already here, so it
 * is passed explicitly rather than relying on the one runtime that is enabled by default.
 * The machine's own config file is ignored, so a stray option on the user's box cannot
 * change what this box does.
 */

import type { RunOptions, RunOutcome } from './runner.ts'
import { present, run } from './runner.ts'

/** What it is called when nobody says otherwise. */
export const YTDLP_DEFAULT = 'yt-dlp'

export const YTDLP_INSTALL =
  'Install yt-dlp (the standalone binary is enough) or set YTDLP_BIN to it.'

const BASE = [
  '--ignore-config',
  '--no-warnings',
  '--no-colors',
  '--js-runtimes',
  'node',
  '--socket-timeout',
  '30',
  '--retries',
  '3',
  '--extractor-retries',
  '3',
  '--sleep-requests',
  '0.75',
]

export function ytdlp(bin: string, args: string[], options: RunOptions = {}): Promise<RunOutcome> {
  return run(bin, [...BASE, ...args], options)
}

export function ytdlpPresent(bin: string): Promise<boolean> {
  return present(bin, ['--version'])
}

const REASONS: [RegExp, string][] = [
  [/rate-limited by YouTube|isn't available, try again later/i, 'YouTube rate limited this machine'],
  [/Sign in to confirm you.?re not a bot|captcha challenge/i, 'YouTube asked for a bot check'],
  [/PO Token which was not provided|because a PO token was not provided/i, 'the captions are behind a proof-of-origin token'],
  [/Private video|Video unavailable|has been removed/i, 'the video is not available'],
  [/age-restricted/i, 'the video is age restricted'],
  [/not available in your country|geo restricted/i, 'the video is blocked in this region'],
  [/members-only|subscriber_only|premium_only/i, 'the video is members only'],
  [/Login details are needed|requires authentication/i, 'the video needs an account'],
  [/Unable to download webpage|timed out|Temporary failure/i, 'the network call failed'],
]

/** What the binary actually said, in one clause a person can read. */
export function reason(stderr: string): string {
  for (const [pattern, text] of REASONS) if (pattern.test(stderr)) return text
  const line = stderr
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('ERROR:'))
    .pop()
  return line ?? 'the caption fetcher failed'
}
