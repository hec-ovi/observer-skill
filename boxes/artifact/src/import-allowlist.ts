/**
 * The bundler's own gate on imports. The static check has already run and produces the
 * readable error; this one exists so nothing reaches `node_modules` or the filesystem even
 * if a specifier is built in a way the AST pass did not recognise.
 */

import type { Plugin } from 'esbuild'
import { REGISTRY_LIST, isRegistryName } from './registry.ts'

export const AGENT_NAMESPACE = 'agent'

export function importAllowlist(): Plugin {
  return {
    name: 'import-allowlist',
    setup(build) {
      // `args.namespace` is the importer's namespace, so this polices the agent's file only.
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.namespace !== AGENT_NAMESPACE) return null
        if (args.kind === 'entry-point') return null

        if (isRegistryName(args.path)) return { path: args.path, external: true }

        return {
          errors: [
            {
              text: `Import of "${args.path}" is not available to artifacts.`,
              notes: [{ text: `Rewrite this using only ${REGISTRY_LIST}; nothing else is loaded on the page.` }],
            },
          ],
        }
      })
    },
  }
}
