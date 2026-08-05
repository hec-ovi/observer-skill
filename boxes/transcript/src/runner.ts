/**
 * Running an external binary. One argv array, never a shell string, because a video URL
 * carries `&` and `?` and the user typed it.
 *
 * Failure is a value, not an exception: a missing binary and a binary that ran and refused
 * are different answers and the providers act on both.
 */

import { execFile } from 'node:child_process'
import type { Readable } from 'node:stream'

export type RunOutcome =
  | { kind: 'ok'; stdout: string; stderr: string }
  | { kind: 'missing'; bin: string }
  | { kind: 'failed'; stderr: string; code: number | null }

export interface RunOptions {
  timeoutMs?: number
  /** yt-dlp's `-J` dump runs to tens of megabytes; Node's default is one. */
  maxBuffer?: number
  /** Called per line as the binary prints, for progress that arrives while it runs. */
  onStdoutLine?: (line: string) => void
}

function byLine(stream: Readable | null, sink: (line: string) => void): void {
  if (!stream) return
  let rest = ''
  stream.on('data', (chunk: string | Buffer) => {
    rest += chunk.toString()
    const parts = rest.split(/\r?\n|\r/)
    rest = parts.pop() ?? ''
    for (const part of parts) if (part.length > 0) sink(part)
  })
}

export function run(bin: string, args: string[], options: RunOptions = {}): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const child = execFile(
      bin,
      args,
      {
        timeout: options.timeoutMs ?? 600_000,
        maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
        killSignal: 'SIGKILL',
        encoding: 'utf8',
        env: { ...process.env, LC_ALL: 'C.UTF-8' },
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ kind: 'ok', stdout, stderr })
          return
        }
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          resolve({ kind: 'missing', bin })
          return
        }
        resolve({
          kind: 'failed',
          stderr: stderr.length > 0 ? stderr : error.message,
          code: typeof code === 'number' ? code : null,
        })
      },
    )
    if (options.onStdoutLine) byLine(child.stdout, options.onStdoutLine)
  })
}

/** Whether the binary is on this machine at all. */
export async function present(bin: string, versionArgs: string[]): Promise<boolean> {
  const outcome = await run(bin, versionArgs, { timeoutMs: 15_000, maxBuffer: 1024 * 1024 })
  return outcome.kind !== 'missing'
}
