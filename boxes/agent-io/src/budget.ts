/**
 * How much one tool result may carry.
 *
 * The client caps a tool result at 25 000 tokens and warns at 10 000. Every result body
 * goes out twice, once as the text block and once as structured content, so the budget is
 * set on the serialized body: 18 000 characters is roughly 9 000 tokens on the wire, which
 * keeps a full result under the warning line.
 *
 * Anything that can grow with the video (the transcript, a batch of inbox events, the
 * concepts covering a second) is trimmed to this and continued with a cursor.
 */

export const RESULT_BUDGET_CHARS = 18_000

export function sizeOf(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0
}

/**
 * The longest prefix of `items` whose serialized size fits the budget. The first item is
 * always kept: a single oversized item is better delivered than silently dropped.
 */
export function fitPrefix<T>(items: readonly T[], budget = RESULT_BUDGET_CHARS): T[] {
  const kept: T[] = []
  let used = 0
  for (const item of items) {
    const size = sizeOf(item) + 1
    if (kept.length > 0 && used + size > budget) break
    kept.push(item)
    used += size
  }
  return kept
}
