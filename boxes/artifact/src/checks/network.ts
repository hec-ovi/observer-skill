/**
 * Check 2: no network and no code loaded at runtime. A visual is drawn from data it was
 * given. The frame blocks these anyway; catching them here turns a blank rectangle into a
 * line number.
 *
 * This finds the names as written, including aliasing them. It is a message, not a
 * boundary: the frame's `connect-src 'none'` is the boundary.
 */

import type { AnyNode } from 'acorn'
import * as walk from 'acorn-walk'
import { REGISTRY_LIST } from '../registry.ts'
import type { BuildError } from '../schema.ts'
import { checkError, type Check } from './context.ts'

const INLINE_IT = 'Put the numbers in the module as a literal; the artifact is built once and never calls out.'

const BANNED = new Map<string, { message: string; fix: string }>([
  [
    'fetch',
    {
      message: 'fetch is not allowed: the artifact frame has no network access.',
      fix: INLINE_IT,
    },
  ],
  [
    'XMLHttpRequest',
    {
      message: 'XMLHttpRequest is not allowed: the artifact frame has no network access.',
      fix: INLINE_IT,
    },
  ],
  [
    'WebSocket',
    {
      message: 'WebSocket is not allowed: the artifact frame has no network access.',
      fix: INLINE_IT,
    },
  ],
])

const GLOBALS = new Set(['window', 'globalThis', 'self'])

export const checkNetwork: Check = (context) => {
  const errors: BuildError[] = []
  const report = (node: AnyNode, name: string): void => {
    const problem = BANNED.get(name)
    if (problem) errors.push(checkError(context, { node, needle: name, ...problem }))
  }

  walk.ancestor(context.ast, {
    ImportExpression(node) {
      errors.push(
        checkError(context, {
          node,
          message: 'Dynamic import() is not allowed: the bundle is built once and loads nothing after that.',
          fix: `Import ${REGISTRY_LIST} at the top of the module and inline everything else.`,
        }),
      )
    },

    Identifier(node, _state, ancestors) {
      if (!BANNED.has(node.name)) return
      const parent = ancestors[ancestors.length - 2]
      // `chart.fetch` and `{ fetch: … }` are names, not the global.
      if (parent?.type === 'MemberExpression' && !parent.computed && parent.property === node) return
      if (parent?.type === 'Property' && !parent.computed && parent.key === node) return
      report(node, node.name)
    },

    MemberExpression(node) {
      if (node.object.type !== 'Identifier' || !GLOBALS.has(node.object.name)) return
      if (node.computed) {
        if (node.property.type === 'Literal' && typeof node.property.value === 'string') {
          report(node, node.property.value)
        }
        return
      }
      if (node.property.type === 'Identifier') report(node, node.property.name)
    },
  })

  return errors
}
