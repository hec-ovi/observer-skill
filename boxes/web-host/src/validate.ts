import type * as z from 'zod/v4'
import { fail } from '#errors'

/**
 * Parse or refuse with the shared error shape. The message names the field, because the
 * reader is a page that has to fix one input, not read a stack trace.
 */
export function parse<S extends z.ZodType>(schema: S, value: unknown, what: string): z.output<S> {
  const result = schema.safeParse(value)
  if (result.success) return result.data

  const issue = result.error.issues[0]
  const at = issue && issue.path.length > 0 ? issue.path.join('.') : null
  const detail = issue?.message ?? 'does not fit the schema'
  fail(
    'INVALID_PATCH',
    at === null ? `${what} is invalid: ${detail}` : `${what} is invalid at "${at}": ${detail}`,
    `Send a ${what} that matches the live channel contract.`,
  )
}
