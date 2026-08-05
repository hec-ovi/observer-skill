/**
 * The pipeline: parse, check, bundle, write. It stops at the first stage that has something
 * to say, so the agent gets one focused list instead of an error cascade. A failed build
 * writes nothing.
 */

import { bundleModule } from './bundle.ts'
import { runChecks } from './checks/index.ts'
import { readModuleShape } from './module-shape.ts'
import { parseModule } from './parse.ts'
import { BuildInputSchema, type BuildError, type BuildInput, type BuildResult } from './schema.ts'
import { SourceText } from './source-text.ts'
import { bundlePathFor, guardSize, writeBundle } from './store.ts'

function inputErrors(issues: readonly { readonly path: PropertyKey[]; message: string }[]): BuildError[] {
  return issues.map((issue) => ({
    stage: 'check',
    message: `${issue.path.join('.') || 'input'}: ${issue.message}`,
    fix: 'Call build with { sessionId, id, source, home }, all of them non-empty.',
  }))
}

export async function build(input: BuildInput): Promise<BuildResult> {
  const parsedInput = BuildInputSchema.safeParse(input)
  if (!parsedInput.success) return { ok: false, errors: inputErrors(parsedInput.error.issues) }

  const { sessionId, id, home } = parsedInput.data
  const source = new SourceText(parsedInput.data.source)

  const parsed = await parseModule(source)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }

  const { ast, map } = parsed.module
  const checkErrors = runChecks({ ast, source, map, shape: readModuleShape(ast) })
  if (checkErrors.length > 0) return { ok: false, errors: checkErrors }

  const bundled = await bundleModule(source)
  if (!bundled.ok) return { ok: false, errors: bundled.errors }

  guardSize(bundled.contents)
  const bundlePath = bundlePathFor(home, sessionId, id)
  await writeBundle(bundlePath, bundled.contents)

  return {
    ok: true,
    bundlePath,
    bytes: bundled.contents.byteLength,
    warnings: bundled.warnings,
  }
}
