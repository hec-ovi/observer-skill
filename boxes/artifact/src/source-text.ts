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

const LINE_BREAK = /\r\n|\r|\n/g

export class SourceText {
  readonly text: string
  private readonly lines: string[]
  /** Character offset where each line starts. */
  private readonly starts: number[]

  constructor(text: string) {
    this.text = text
    this.lines = []
    this.starts = []
    // Cut on the real separator each time: a CRLF is two characters, and counting it as one
    // would slide every later offset away from the text the caret is drawn against.
    let start = 0
    for (const match of text.matchAll(LINE_BREAK)) {
      this.lines.push(text.slice(start, match.index))
      this.starts.push(start)
      start = match.index + match[0].length
    }
    this.lines.push(text.slice(start))
    this.starts.push(start)
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

  /**
   * First occurrence of `needle` at or after `from`. The needle sits inside the node that
   * was found, so searching from the node itself keeps the caret off an earlier, compliant
   * occurrence on the same line; the line start is the fallback for when the mapped position
   * lands past the needle.
   */
  find(needle: string, from: Position): Position | null {
    if (needle.length === 0) return null
    const ahead = this.text.indexOf(needle, this.offsetAt(from))
    if (ahead !== -1) return this.positionAt(ahead)
    const onLine = this.text.indexOf(needle, this.offsetAt({ line: from.line, column: 1 }))
    return onLine === -1 ? null : this.positionAt(onLine)
  }

  /** The offending line with a caret under the column, indented the way the line is. */
  snippet(position: Position): string {
    const line = this.lineText(position.line)
    const before = line.slice(0, Math.max(position.column - 1, 0))
    const pad = [...before].map((char) => (char === '\t' ? '\t' : ' ')).join('')
    return `${line}\n${pad}^`
  }
}
