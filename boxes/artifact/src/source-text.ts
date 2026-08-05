/**
 * The source exactly as the agent submitted it, addressable by line and column. Every error
 * this box reports points into this text and nothing else.
 */

export interface Position {
  /** 1-based. */
  line: number
  /** 1-based, in characters. */
  column: number
}

export class SourceText {
  readonly text: string
  private readonly lines: string[]
  /** Character offset where each line starts. */
  private readonly starts: number[]

  constructor(text: string) {
    this.text = text
    this.lines = text.split(/\r\n|\r|\n/)
    this.starts = []
    let offset = 0
    for (const line of this.lines) {
      this.starts.push(offset)
      offset += line.length + 1
    }
  }

  lineText(line: number): string {
    return this.lines[line - 1] ?? ''
  }

  offsetAt(position: Position): number {
    const start = this.starts[Math.min(Math.max(position.line, 1), this.lines.length) - 1] ?? 0
    return start + Math.max(position.column - 1, 0)
  }

  positionAt(offset: number): Position {
    let line = 1
    for (let i = 0; i < this.starts.length; i++) {
      const start = this.starts[i]
      if (start === undefined || start > offset) break
      line = i + 1
    }
    return { line, column: offset - (this.starts[line - 1] ?? 0) + 1 }
  }

  /** First occurrence of `needle` at or after the start of `from`'s line, if there is one. */
  find(needle: string, from: Position): Position | null {
    if (needle.length === 0) return null
    const index = this.text.indexOf(needle, this.offsetAt({ line: from.line, column: 1 }))
    return index === -1 ? null : this.positionAt(index)
  }

  /** The offending line with a caret under the column, indented the way the line is. */
  snippet(position: Position): string {
    const line = this.lineText(position.line)
    const before = line.slice(0, Math.max(position.column - 1, 0))
    const pad = [...before].map((char) => (char === '\t' ? '\t' : ' ')).join('')
    return `${line}\n${pad}^`
  }
}
