/**
 * What the module exports, read from the AST. Nothing here evaluates anything: an export is
 * only "known" when it was written as a literal the parser can see.
 */

import type { AnyNode, ObjectExpression, Program } from 'acorn'

export interface ExportedBinding {
  /** Where an error about this export should point. */
  node: AnyNode
  /** The expression the name was bound to, when it is visible in the module. */
  value: AnyNode | null
}

export interface StringField {
  node: AnyNode
  /** The literal text, or null when the field was not written as a string literal. */
  value: string | null
}

export interface ModuleShape {
  meta: ExportedBinding | null
  mount: ExportedBinding | null
  /** `meta.title` when it is a plain string literal; the heading check compares against it. */
  title: string | null
}

function nameOf(node: AnyNode): string | null {
  if (node.type === 'Identifier') return node.name
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value
  return null
}

export function readStringField(object: ObjectExpression, field: string): StringField | null {
  for (const property of object.properties) {
    if (property.type !== 'Property' || property.computed) continue
    if (nameOf(property.key) !== field) continue
    const value = property.value
    const text = value.type === 'Literal' && typeof value.value === 'string' ? value.value : null
    return { node: value, value: text }
  }
  return null
}

/** Top-level `const x = …`, `function x() {}`, `class x {}`, so `export { x }` can be followed. */
function topLevelBindings(ast: Program): Map<string, ExportedBinding> {
  const bindings = new Map<string, ExportedBinding>()
  for (const statement of ast.body) {
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
    if (!declaration) continue
    if (declaration.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        if (declarator.id.type !== 'Identifier') continue
        bindings.set(declarator.id.name, { node: declarator, value: declarator.init ?? null })
      }
    } else if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') {
      if (declaration.id) bindings.set(declaration.id.name, { node: declaration, value: declaration })
    }
  }
  return bindings
}

function exportedNames(ast: Program, bindings: Map<string, ExportedBinding>): Map<string, ExportedBinding> {
  const exports = new Map<string, ExportedBinding>()
  for (const statement of ast.body) {
    if (statement.type !== 'ExportNamedDeclaration') continue

    if (statement.declaration) {
      const declaration = statement.declaration
      if (declaration.type === 'VariableDeclaration') {
        for (const declarator of declaration.declarations) {
          if (declarator.id.type !== 'Identifier') continue
          exports.set(declarator.id.name, { node: declarator, value: declarator.init ?? null })
        }
      } else if (declaration.id) {
        exports.set(declaration.id.name, { node: declaration, value: declaration })
      }
      continue
    }

    if (statement.source) continue
    for (const specifier of statement.specifiers) {
      const local = nameOf(specifier.local)
      const exported = nameOf(specifier.exported)
      if (!local || !exported) continue
      const binding = bindings.get(local)
      exports.set(exported, binding ?? { node: specifier, value: null })
    }
  }
  return exports
}

export function readModuleShape(ast: Program): ModuleShape {
  const exports = exportedNames(ast, topLevelBindings(ast))
  const meta = exports.get('meta') ?? null
  const mount = exports.get('mount') ?? null

  const object = meta?.value?.type === 'ObjectExpression' ? meta.value : null
  const title = object ? (readStringField(object, 'title')?.value ?? null) : null

  return { meta, mount, title }
}
