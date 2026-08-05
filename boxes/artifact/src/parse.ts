/**
 * Read the module without running it. Types are stripped first (the source may be
 * TypeScript), then acorn parses the plain-JS copy; the source map from the strip is what
 * puts every later finding back on the line the agent wrote.
 */

import { parse } from 'acorn'
import type { Program } from 'acorn'
import * as esbuild from 'esbuild'
import { isBuildFailure, toBuildError } from './messages.ts'
import { PositionMap } from './position-map.ts'
import type { BuildError } from './schema.ts'
import type { SourceText } from './source-text.ts'

export interface ParsedModule {
  ast: Program
  map: PositionMap
}

export type ParseOutcome =
  | { ok: true; module: ParsedModule }
  | { ok: false; errors: BuildError[] }

const SYNTAX_FIX =
  'Fix the syntax at that position: the module has to parse as an ES module before anything else can be checked.'

interface LocatedSyntaxError extends SyntaxError {
  loc?: { line: number; column: number }
}

/** acorn appends "(line:column)" of the copy it parsed, which is not the agent's numbering. */
function withoutPosition(message: string): string {
  return message.replace(/\s*\(\d+:\d+\)$/, '')
}

export async function parseModule(source: SourceText): Promise<ParseOutcome> {
  let stripped: esbuild.TransformResult
  try {
    stripped = await esbuild.transform(source.text, {
      loader: 'ts',
      format: 'esm',
      target: 'esnext',
      sourcefile: 'artifact.ts',
      sourcemap: 'external',
      sourcesContent: false,
      logLevel: 'silent',
      logLimit: 0,
      // Without this, stripping types also drops imports the module never used, and an
      // import nobody can resolve would slip past the allowlist unseen.
      tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
    })
  } catch (error) {
    if (!isBuildFailure(error)) throw error
    const errors = error.errors.map((message) => {
      const built = toBuildError(message, 'check', source)
      return { ...built, fix: built.fix ?? SYNTAX_FIX }
    })
    return { ok: false, errors }
  }

  const map = PositionMap.decode(stripped.map)
  try {
    const ast = parse(stripped.code, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
    })
    return { ok: true, module: { ast, map } }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    const at = (error as LocatedSyntaxError).loc
    const position = at ? map.original({ line: at.line, column: at.column + 1 }) : { line: 1, column: 1 }
    return {
      ok: false,
      errors: [
        {
          stage: 'check',
          message: withoutPosition(error.message),
          line: position.line,
          column: position.column,
          snippet: source.snippet(position),
          fix: SYNTAX_FIX,
        },
      ],
    }
  }
}
