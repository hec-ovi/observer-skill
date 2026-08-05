/**
 * Every string the module carries as a literal. The heading check reads markup the agent
 * embedded; this is the one place that isolates it, so no check ever runs a regex over the
 * raw source.
 */

import type { AnyNode, Program } from 'acorn'
import * as walk from 'acorn-walk'

export function forEachString(
  ast: Program,
  visit: (text: string, node: AnyNode) => void,
): void {
  walk.simple(ast, {
    Literal(node) {
      if (typeof node.value === 'string') visit(node.value, node)
    },
    TemplateLiteral(node) {
      // The whole template is the node to point at; `find` refines to the offending text.
      for (const quasi of node.quasis) visit(quasi.value.cooked ?? quasi.value.raw, node)
    },
  })
}
