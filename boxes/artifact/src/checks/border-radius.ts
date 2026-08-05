/**
 * Check 3: corners are square. The rule is `--radius: 0` across the whole design, and this
 * is where it is enforced for anything an artifact draws: CSS text, inline style objects,
 * and the ECharts option keys that round geometry.
 *
 * CSS is matched inside strings acorn already isolated, never over the raw source.
 */

import type { AnyNode } from 'acorn'
import * as walk from 'acorn-walk'
import type { BuildError } from '../schema.ts'
import { checkError, type Check } from './context.ts'
import { forEachString } from './strings.ts'

/** borderRadius, borderTopLeftRadius, … as written in a style object or an ECharts option. */
const CAMEL_KEY = /^border(?:(?:Top|Bottom)(?:Left|Right))?Radius$/
/** border-radius, border-top-left-radius, … as written in CSS. */
const CSS_DECLARATION = /border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*([^;{}\n]*)/gi

const ZERO_TOKEN = /^0(?:\.0+)?(?:[a-z]+|%)?$/i

/** "0", "0px", "0 0 0 0", "0 / 0" all pass; anything with a length in it does not. */
function isZeroText(value: string): boolean {
  const tokens = (value.split('/')[0] ?? '').trim().split(/\s+/).filter(Boolean)
  return tokens.length > 0 && tokens.every((token) => ZERO_TOKEN.test(token))
}

type Verdict = 'zero' | 'rounded' | 'unreadable'

function verdictFor(node: AnyNode): Verdict {
  if (node.type === 'Literal') {
    if (typeof node.value === 'number') return node.value === 0 ? 'zero' : 'rounded'
    if (typeof node.value === 'string') return isZeroText(node.value) ? 'zero' : 'rounded'
    return 'unreadable'
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    const quasi = node.quasis[0]
    const text = quasi ? (quasi.value.cooked ?? quasi.value.raw) : null
    return text !== null && isZeroText(text) ? 'zero' : 'rounded'
  }
  if (node.type === 'ArrayExpression') {
    const verdicts = node.elements.map((element) => (element ? verdictFor(element) : 'zero'))
    if (verdicts.includes('rounded')) return 'rounded'
    return verdicts.includes('unreadable') ? 'unreadable' : 'zero'
  }
  return 'unreadable'
}

function problemFor(key: string, verdict: Verdict): { message: string; fix: string } | null {
  if (verdict === 'zero') return null
  if (verdict === 'rounded') {
    return {
      message: `${key} rounds the corners, and the design has none.`,
      fix: `Set ${key} to 0.`,
    }
  }
  return {
    message: `${key} is set from an expression, so it cannot be read without running the module.`,
    fix: `Write a literal 0 for ${key}.`,
  }
}

export const checkBorderRadius: Check = (context) => {
  const errors: BuildError[] = []

  const flagValue = (node: AnyNode, key: string, value: AnyNode): void => {
    const problem = problemFor(key, verdictFor(value))
    if (problem) errors.push(checkError(context, { node, needle: key, ...problem }))
  }

  const flagCss = (text: string, node: AnyNode): void => {
    for (const match of text.matchAll(CSS_DECLARATION)) {
      const value = (match[1] ?? '').trim()
      if (isZeroText(value)) continue
      errors.push(
        checkError(context, {
          node,
          needle: match[0],
          message: `"${match[0].trim()}" rounds the corners, and the design has none.`,
          fix: 'Write the declaration as border-radius: 0, or drop it.',
        }),
      )
    }
  }

  forEachString(context.ast, flagCss)

  walk.simple(context.ast, {
    Property(node) {
      if (node.computed) return
      const key =
        node.key.type === 'Identifier'
          ? node.key.name
          : node.key.type === 'Literal' && typeof node.key.value === 'string'
            ? node.key.value
            : null
      if (key && CAMEL_KEY.test(key)) flagValue(node, key, node.value)
    },
    AssignmentExpression(node) {
      const target = node.left
      if (target.type !== 'MemberExpression' || target.computed) return
      if (target.property.type !== 'Identifier' || !CAMEL_KEY.test(target.property.name)) return
      flagValue(node, target.property.name, node.right)
    },
  })

  return errors
}
