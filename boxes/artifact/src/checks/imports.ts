/**
 * Check 1: every import resolves to the page registry. Anything else is a blank stage at
 * runtime, so it is refused here where the agent can still read a line number.
 */

import * as walk from 'acorn-walk'
import { REGISTRY_LIST, isRegistryName, registrySubpathRoot } from '../registry.ts'
import type { BuildError } from '../schema.ts'
import { checkError, type Check } from './context.ts'

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i

function problemFor(specifier: string): { message: string; fix: string } | null {
  if (isRegistryName(specifier)) return null

  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    return {
      message: `Import of "${specifier}" pulls in another file, and an artifact is one self-contained module.`,
      fix: 'Move what that file held into this module: data as a literal, helpers as local functions.',
    }
  }

  if (URL_SCHEME.test(specifier)) {
    return {
      message: `Import of "${specifier}" loads code over the network, which the artifact frame blocks.`,
      fix: `Import only ${REGISTRY_LIST}; they are already on the page.`,
    }
  }

  const root = registrySubpathRoot(specifier)
  if (root) {
    return {
      message: `Import of "${specifier}" asks for a subpath, and the page serves the package root only.`,
      fix: `Write "import * as ${root} from '${root}'" and reach the rest through it.`,
    }
  }

  return {
    message: `Import of "${specifier}" is not available to artifacts.`,
    fix: `Rewrite this using only ${REGISTRY_LIST}; nothing else is loaded on the page.`,
  }
}

/** `require` survives bundling as a shim that throws in the browser, so it is refused here. */
function requireProblem(specifier: string | null): { message: string; fix: string } {
  const named = specifier ? `require("${specifier}")` : 'require()'
  if (specifier && isRegistryName(specifier)) {
    return {
      message: `${named} is CommonJS, and an artifact is an ES module.`,
      fix: `Write "import * as ${specifier} from '${specifier}'" at the top of the module.`,
    }
  }
  return {
    message: `${named} is CommonJS, and an artifact is an ES module.`,
    fix: `Import ${REGISTRY_LIST} at the top of the module; nothing else can be loaded.`,
  }
}

export const checkImports: Check = (context) => {
  const errors: BuildError[] = []

  walk.simple(context.ast, {
    CallExpression(node) {
      if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return
      const argument = node.arguments[0]
      const specifier =
        argument?.type === 'Literal' && typeof argument.value === 'string' ? argument.value : null
      errors.push(checkError(context, { node, needle: 'require', ...requireProblem(specifier) }))
    },
  })

  for (const statement of context.ast.body) {
    if (
      statement.type !== 'ImportDeclaration' &&
      statement.type !== 'ExportNamedDeclaration' &&
      statement.type !== 'ExportAllDeclaration'
    ) {
      continue
    }
    const source = statement.source
    if (!source || typeof source.value !== 'string') continue

    const problem = problemFor(source.value)
    if (problem) errors.push(checkError(context, { node: source, needle: source.value, ...problem }))
  }
  return errors
}
