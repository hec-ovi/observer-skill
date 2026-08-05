/**
 * Check 3: no heading that says what the stage already says. The stage draws `meta.title`
 * above the artifact, so a repeated heading is the exact bloat this design refuses.
 *
 * It reads headings written as markup and headings built with createElement. Text assembled
 * at runtime is invisible to it, by design: nothing here runs.
 */

import type { AnyNode } from 'acorn'
import * as walk from 'acorn-walk'
import type { BuildError } from '../schema.ts'
import { checkError, type Check, type CheckContext } from './context.ts'
import { forEachString } from './strings.ts'

const HEADING_MARKUP = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi
const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const TEXT_SINKS = new Set(['textContent', 'innerText', 'innerHTML'])

function normalize(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The same words, or one wrapped in a couple of extra ones. */
function repeatsTitle(text: string, title: string): boolean {
  const heading = normalize(text)
  const wanted = normalize(title)
  if (!heading || !wanted) return false
  if (heading === wanted) return true
  if (heading.length <= 4 || wanted.length <= 4) return false
  if (!heading.includes(wanted) && !wanted.includes(heading)) return false
  return Math.min(heading.length, wanted.length) / Math.max(heading.length, wanted.length) > 0.8
}

function stringOf(node: AnyNode): string | null {
  if (node.type === 'Literal') return typeof node.value === 'string' ? node.value : null
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? null
  }
  return null
}

/** Locals bound to a heading element, so a later `.textContent =` can be recognised. */
function headingLocals(context: CheckContext): Set<string> {
  const locals = new Set<string>()
  walk.simple(context.ast, {
    VariableDeclarator(node) {
      if (node.id.type !== 'Identifier' || node.init?.type !== 'CallExpression') return
      const callee = node.init.callee
      if (callee.type !== 'MemberExpression' || callee.computed) return
      if (callee.property.type !== 'Identifier' || callee.property.name !== 'createElement') return
      const tag = node.init.arguments[0]
      if (!tag || tag.type !== 'Literal' || typeof tag.value !== 'string') return
      if (HEADING_TAGS.has(tag.value.toLowerCase())) locals.add(node.id.name)
    },
  })
  return locals
}

export const checkHeading: Check = (context) => {
  const title = context.shape.title
  if (!title) return []

  const errors: BuildError[] = []
  const locals = headingLocals(context)

  const flag = (text: string, node: AnyNode): void => {
    if (!repeatsTitle(text, title)) return
    errors.push(
      checkError(context, {
        node,
        needle: text.trim(),
        message: `The heading "${text.trim()}" repeats meta.title.`,
        fix: 'Drop the heading. The stage draws the title above the artifact, once.',
      }),
    )
  }

  const flagMarkup = (markup: string, node: AnyNode): void => {
    for (const match of markup.matchAll(HEADING_MARKUP)) flag(match[2] ?? '', node)
  }

  forEachString(context.ast, flagMarkup)

  walk.simple(context.ast, {
    AssignmentExpression(node) {
      const target = node.left
      if (target.type !== 'MemberExpression' || target.computed) return
      if (target.property.type !== 'Identifier' || !TEXT_SINKS.has(target.property.name)) return
      if (target.object.type !== 'Identifier' || !locals.has(target.object.name)) return
      const text = stringOf(node.right)
      if (text !== null) flag(text, node)
    },
  })

  return errors
}
