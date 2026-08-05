/**
 * One frame of the event-stream grammar. Multi-line data becomes several `data:` lines, a
 * comment is a line starting with `:`, and a frame ends with a blank line.
 */
export interface SseFrame {
  id?: string
  event?: string
  /** Reconnection interval in milliseconds, sent once when the stream opens. */
  retry?: number
  /** Already-serialized payload. */
  data?: string
  /** Comment line, which every client ignores. */
  comment?: string
}

export function frame(f: SseFrame): string {
  let out = ''
  if (f.comment !== undefined) out += `: ${f.comment}\n`
  if (f.id !== undefined) out += `id: ${f.id}\n`
  if (f.event !== undefined) out += `event: ${f.event}\n`
  if (f.retry !== undefined) out += `retry: ${Math.trunc(f.retry)}\n`
  if (f.data !== undefined) for (const line of f.data.split('\n')) out += `data: ${line}\n`
  return `${out}\n`
}
