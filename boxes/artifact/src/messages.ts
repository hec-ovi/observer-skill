/**
 * esbuild's `Message` objects, turned into what the agent reads. Columns arrive as UTF-8
 * byte offsets while the line is a JS string, so an accented axis label would shift the
 * caret if it were used as-is.
 */

import type { BuildFailure, Message } from 'esbuild'
import type { BuildError } from './schema.ts'
import type { SourceText } from './source-text.ts'

const encoder = new TextEncoder()

function byteColumnToCharacter(lineText: string, byteColumn: number): number {
  let bytes = 0
  for (let index = 0; index < lineText.length; index++) {
    if (bytes >= byteColumn) return index
    const codePoint = lineText.codePointAt(index)
    if (codePoint === undefined) break
    bytes += encoder.encode(String.fromCodePoint(codePoint)).length
    if (codePoint > 0xffff) index += 1
  }
  return lineText.length
}

/**
 * esbuild notes come in two shapes. One stands alone as an instruction. The other points at
 * a second place in the source ("The name … was originally exported here:") and carries the
 * location that sentence is missing; that one describes the problem, so it joins the message
 * with its line, and the fix is left to the caller's instruction.
 */
function pointersIn(message: Message): string[] {
  const pointers: string[] = []
  for (const note of message.notes) {
    const text = note.text.trim()
    if (note.location && text.length > 0) pointers.push(`${text} line ${note.location.line}.`)
  }
  return pointers
}

function describe(message: Message): string {
  const pointers = pointersIn(message)
  if (pointers.length === 0) return message.text
  const head = message.text.trim()
  return [/[.!?:]$/.test(head) ? head : `${head}.`, ...pointers].join(' ')
}

function fixFrom(message: Message): string | undefined {
  const parts = message.notes
    .filter((note) => !note.location)
    .map((note) => note.text.trim())
    .filter((text) => text.length > 0)
  const suggestion = message.location?.suggestion
  if (suggestion) parts.push(`Write \`${suggestion}\` at that position.`)
  return parts.length > 0 ? parts.join(' ') : undefined
}

export function toBuildError(
  message: Message,
  stage: BuildError['stage'],
  source: SourceText,
): BuildError {
  const fix = fixFrom(message)
  const text = describe(message)
  const location = message.location
  if (!location) return { stage, message: text, ...(fix ? { fix } : {}) }

  const column = byteColumnToCharacter(location.lineText, location.column) + 1
  const position = { line: location.line, column }
  return {
    stage,
    message: text,
    line: position.line,
    column: position.column,
    snippet: source.snippet(position),
    ...(fix ? { fix } : {}),
  }
}

export function toWarningText(message: Message): string {
  const location = message.location
  if (!location) return message.text
  return `${message.text} (line ${location.line})`
}

/** The JS build API rejects; the errors live on the thrown value, not in its message. */
export function isBuildFailure(error: unknown): error is BuildFailure {
  return error instanceof Error && Array.isArray((error as Partial<BuildFailure>).errors)
}
