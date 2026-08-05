/**
 * Where each row sits, in pixels, when only the rows on screen exist.
 *
 * A row starts at an estimate and keeps it until it has been on screen once, which is the
 * only moment its real height can be read. Offsets are prefix sums, rebuilt from the first
 * row that moved rather than from the top, so a measurement costs nothing above it.
 */
export class RowMetrics {
  readonly count: number
  readonly #heights: Float64Array
  readonly #offsets: Float64Array
  /** Offsets up to and including this row are correct. */
  #validTo = 0

  constructor(count: number, estimate: number) {
    this.count = count
    this.#heights = new Float64Array(count).fill(estimate)
    this.#offsets = new Float64Array(count + 1)
  }

  /** Record a row's real height. True when it moved, so the caller can lay out again. */
  measured(i: number, height: number): boolean {
    if (i < 0 || i >= this.count || height <= 0) return false
    if (this.#heights[i] === height) return false
    this.#heights[i] = height
    if (i < this.#validTo) this.#validTo = i
    return true
  }

  offsetOf(i: number): number {
    const row = Math.max(0, Math.min(i, this.count))
    this.#fill(row)
    return this.#offsets[row] ?? 0
  }

  total(): number {
    return this.offsetOf(this.count)
  }

  /** The row at a pixel offset from the top. */
  indexAt(offset: number): number {
    if (this.count === 0) return 0
    this.#fill(this.count)
    let low = 0
    let high = this.count - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if ((this.#offsets[middle] ?? 0) <= offset) low = middle
      else high = middle - 1
    }
    return low
  }

  #fill(upTo: number): void {
    for (let i = this.#validTo; i < upTo; i += 1) {
      this.#offsets[i + 1] = (this.#offsets[i] ?? 0) + (this.#heights[i] ?? 0)
    }
    if (upTo > this.#validTo) this.#validTo = upTo
  }
}
