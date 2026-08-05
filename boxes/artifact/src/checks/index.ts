/**
 * Every check, in the order an agent wants to read them: what the module is, then what it
 * pulls in, then what it draws. The findings come back sorted by position.
 */

import type { BuildError } from '../schema.ts'
import type { Check, CheckContext } from './context.ts'
import { checkExports } from './exports.ts'
import { checkHeading } from './heading.ts'
import { checkImports } from './imports.ts'
import { checkNetwork } from './network.ts'

export const CHECKS: readonly Check[] = [checkExports, checkImports, checkNetwork, checkHeading]

export function runChecks(context: CheckContext): BuildError[] {
  return CHECKS.flatMap((check) => check(context)).sort(
    (a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0),
  )
}

export type { Check, CheckContext } from './context.ts'
