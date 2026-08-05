/**
 * What every check is handed, and the one way it reports a finding. Checks are pure: they
 * read this and return errors, they never touch disk and never run the module.
 */

import type { AnyNode, Program } from 'acorn'
import type { ModuleShape } from '../module-shape.ts'
import type { PositionMap } from '../position-map.ts'
import type { BuildError } from '../schema.ts'
import type { Position, SourceText } from '../source-text.ts'

export interface CheckContext {
  /** The parsed module, with types already stripped. */
  ast: Program
  /** The source the agent submitted; every error points here. */
  source: SourceText
  /** Stripped-copy positions back to submitted-source positions. */
  map: PositionMap
  shape: ModuleShape
}

export type Check = (context: CheckContext) => BuildError[]

export interface Finding {
  node: AnyNode
  message: string
  /** One sentence naming what to write instead. */
  fix: string
  /** Text to point at inside the node, when the node covers more than the problem does. */
  needle?: string
}

function positionOf(context: CheckContext, finding: Finding): Position {
  const start = finding.node.loc?.start
  const generated = start ? { line: start.line, column: start.column + 1 } : { line: 1, column: 1 }
  const original = context.map.original(generated)
  if (!finding.needle) return original
  return context.source.find(finding.needle, original) ?? original
}

export function checkError(context: CheckContext, finding: Finding): BuildError {
  const position = positionOf(context, finding)
  return {
    stage: 'check',
    message: finding.message,
    line: position.line,
    column: position.column,
    snippet: context.source.snippet(position),
    fix: finding.fix,
  }
}
