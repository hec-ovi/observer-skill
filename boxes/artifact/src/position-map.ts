/**
 * The checks read an AST of the type-stripped module, so every position they find belongs to
 * that copy. This maps it back to the line the agent actually wrote, using the source map
 * esbuild produced for the strip.
 */

import type { Position } from './source-text.ts'

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const DIGIT = new Map<string, number>([...BASE64].map((char, index) => [char, index]))

interface Mapping {
  /** 0-based column in the stripped copy. */
  generatedColumn: number
  /** 0-based line in the submitted source. */
  line: number
  /** 0-based column in the submitted source. */
  column: number
}

/** One `,`-separated group: base64 VLQ numbers, each relative to the previous one. */
function decodeSegment(text: string): number[] {
  const values: number[] = []
  let index = 0
  while (index < text.length) {
    let shift = 0
    let value = 0
    let more = true
    while (more && index < text.length) {
      const digit = DIGIT.get(text[index] ?? '')
      index += 1
      if (digit === undefined) return values
      more = (digit & 32) !== 0
      value += (digit & 31) * 2 ** shift
      shift += 5
    }
    const negative = (value & 1) === 1
    value = Math.floor(value / 2)
    values.push(negative ? -value : value)
  }
  return values
}

export class PositionMap {
  private readonly lines: Mapping[][]

  private constructor(lines: Mapping[][]) {
    this.lines = lines
  }

  /** An identity map, for when there is nothing to translate. */
  static identity(): PositionMap {
    return new PositionMap([])
  }

  static decode(mapJson: string): PositionMap {
    let mappings = ''
    try {
      const parsed: unknown = JSON.parse(mapJson)
      if (parsed && typeof parsed === 'object' && 'mappings' in parsed) {
        const raw = (parsed as { mappings: unknown }).mappings
        if (typeof raw === 'string') mappings = raw
      }
    } catch {
      return PositionMap.identity()
    }

    const lines: Mapping[][] = []
    let sourceLine = 0
    let sourceColumn = 0
    for (const group of mappings.split(';')) {
      const segments: Mapping[] = []
      let generatedColumn = 0
      if (group.length > 0) {
        for (const segment of group.split(',')) {
          const values = decodeSegment(segment)
          const first = values[0]
          if (first === undefined) continue
          generatedColumn += first
          if (values.length < 4) continue
          sourceLine += values[2] ?? 0
          sourceColumn += values[3] ?? 0
          segments.push({ generatedColumn, line: sourceLine, column: sourceColumn })
        }
      }
      lines.push(segments)
    }
    return new PositionMap(lines)
  }

  /** The position in the submitted source that produced this position in the stripped copy. */
  original(generated: Position): Position {
    if (this.lines.length === 0) return generated
    const segments = this.lines[generated.line - 1] ?? []

    let best: Mapping | undefined
    for (const segment of segments) {
      if (segment.generatedColumn > generated.column - 1) break
      best = segment
    }
    best ??= segments[0] ?? this.lastBefore(generated.line)
    if (!best) return generated
    return { line: best.line + 1, column: best.column + 1 }
  }

  /** Lines that carry no mapping of their own belong to the last statement that did. */
  private lastBefore(generatedLine: number): Mapping | undefined {
    for (let index = generatedLine - 2; index >= 0; index--) {
      const segments = this.lines[index] ?? []
      const last = segments[segments.length - 1]
      if (last) return last
    }
    return undefined
  }
}
