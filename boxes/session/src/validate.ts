import * as z from 'zod/v4'
import { fail } from '#errors'

/**
 * One way in. Anything that does not fit the schema is `INVALID_PATCH` with the field named,
 * because the reader is usually an agent that has to fix it in one step.
 */
export function parse<T extends z.ZodType>(
  schema: T,
  value: unknown,
  what: string,
  hint: string,
): z.output<T> {
  const result = schema.safeParse(value)
  if (result.success) return result.data
  fail('INVALID_PATCH', `${what} is not valid.\n${z.prettifyError(result.error)}`, hint)
}
