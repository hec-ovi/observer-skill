/**
 * Check 5: the module is the shape the stage mounts. Read statically, because a module
 * missing either export is a blank stage and the source must never be executed to find out.
 */

import { readStringField } from '../module-shape.ts'
import { ARTIFACT_KINDS } from '../schema.ts'
import type { BuildError } from '../schema.ts'
import { checkError, type Check, type CheckContext } from './context.ts'

const META_EXAMPLE = "export const meta = { title: 'Short name', kind: 'chart' }"
const MOUNT_EXAMPLE = 'export function mount(el, ctx) { /* draw into el */ return () => {} }'
const KIND_LIST = ARTIFACT_KINDS.join(', ')

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

function checkMeta(context: CheckContext): BuildError[] {
  const meta = context.shape.meta
  if (!meta) {
    return [
      checkError(context, {
        node: context.ast,
        message: 'meta is not exported, so the stage has no title and no kind for this artifact.',
        fix: `Add: ${META_EXAMPLE}`,
      }),
    ]
  }

  if (meta.value?.type !== 'ObjectExpression') {
    return [
      checkError(context, {
        node: meta.node,
        message: 'meta must be an object literal, so it can be read without running the module.',
        fix: `Write it inline: ${META_EXAMPLE}`,
      }),
    ]
  }

  const errors: BuildError[] = []
  const object = meta.value

  const title = readStringField(object, 'title')
  if (!title) {
    errors.push(
      checkError(context, {
        node: object,
        message: 'meta.title is missing.',
        fix: "Add title: 'Short name', the line the stage draws above the artifact.",
      }),
    )
  } else if (title.value === null) {
    errors.push(
      checkError(context, {
        node: title.node,
        message: 'meta.title must be a string literal.',
        fix: 'Write the title out as text; it is read without running the module.',
      }),
    )
  } else if (title.value.trim().length === 0) {
    errors.push(
      checkError(context, {
        node: title.node,
        message: 'meta.title is empty.',
        fix: 'Give the artifact a short name; the stage draws it above the visual.',
      }),
    )
  }

  const kind = readStringField(object, 'kind')
  if (!kind) {
    errors.push(
      checkError(context, {
        node: object,
        message: 'meta.kind is missing.',
        fix: `Add kind: one of ${KIND_LIST}.`,
      }),
    )
  } else if (kind.value === null || !(ARTIFACT_KINDS as readonly string[]).includes(kind.value)) {
    errors.push(
      checkError(context, {
        node: kind.node,
        message: `meta.kind must be a string literal, one of ${KIND_LIST}.`,
        fix: `Write kind: '${ARTIFACT_KINDS[0]}' if the artifact plots data, otherwise the kind that fits.`,
      }),
    )
  }

  const caption = readStringField(object, 'caption')
  if (caption && caption.value === null) {
    errors.push(
      checkError(context, {
        node: caption.node,
        message: 'meta.caption must be a string literal.',
        fix: 'Write the caption out as text, or drop the field.',
      }),
    )
  }

  return errors
}

function checkMount(context: CheckContext): BuildError[] {
  const mount = context.shape.mount
  if (!mount) {
    return [
      checkError(context, {
        node: context.ast,
        message: 'mount is not exported, so the stage has nothing to call.',
        fix: `Add: ${MOUNT_EXAMPLE}`,
      }),
    ]
  }

  if (!mount.value || !FUNCTION_TYPES.has(mount.value.type)) {
    return [
      checkError(context, {
        node: mount.node,
        message: 'mount must be a function declared in this module.',
        fix: `Write it out: ${MOUNT_EXAMPLE}`,
      }),
    ]
  }

  return []
}

export const checkExports: Check = (context) => [...checkMeta(context), ...checkMount(context)]
