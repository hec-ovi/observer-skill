/**
 * One function, so the bundler can be swapped. It builds from a virtual file in its own
 * namespace: nothing is read from disk, and the three registry names stay bare imports for
 * the page to resolve.
 */

import * as esbuild from 'esbuild'
import { AGENT_NAMESPACE, importAllowlist } from './import-allowlist.ts'
import { isBuildFailure, toBuildError, toWarningText } from './messages.ts'
import type { BuildError } from './schema.ts'
import type { SourceText } from './source-text.ts'

const ENTRY = 'artifact'

export type BundleOutcome =
  | { ok: true; contents: Uint8Array; warnings: string[] }
  | { ok: false; errors: BuildError[] }

function virtualEntry(source: string): esbuild.Plugin {
  return {
    name: 'virtual-entry',
    setup(build) {
      build.onResolve({ filter: /^artifact$/ }, () => ({ path: ENTRY, namespace: AGENT_NAMESPACE }))
      build.onLoad({ filter: /.*/, namespace: AGENT_NAMESPACE }, () => ({
        contents: source,
        loader: 'ts',
      }))
    },
  }
}

export async function bundleModule(source: SourceText): Promise<BundleOutcome> {
  try {
    const result = await esbuild.build({
      entryPoints: [ENTRY],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['chrome120', 'firefox121', 'safari17'],
      sourcemap: 'inline',
      sourcesContent: true,
      write: false,
      outfile: 'artifact.js',
      minify: false,
      treeShaking: true,
      legalComments: 'none',
      logLevel: 'silent',
      logLimit: 0,
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [virtualEntry(source.text), importAllowlist()],
    })

    const output = result.outputFiles[0]
    if (!output) {
      return {
        ok: false,
        errors: [
          {
            stage: 'bundle',
            message: 'The bundler produced no output for this module.',
            fix: 'Check that the module has top-level exports and try again.',
          },
        ],
      }
    }

    return { ok: true, contents: output.contents, warnings: result.warnings.map(toWarningText) }
  } catch (error) {
    if (!isBuildFailure(error)) throw error
    return { ok: false, errors: error.errors.map((message) => toBuildError(message, 'bundle', source)) }
  }
}
