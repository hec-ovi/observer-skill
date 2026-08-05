import * as esbuild from 'esbuild'
const cases = {
  dupExport: `export const meta = { title: 'A', kind: 'chart' }\nexport const meta = 2\nexport function mount(el) { return () => {} }\n`,
  dupConst: `const a = 1\nconst a = 2\nexport function mount(el) { return () => {} }\n`,
  dupParam: `export function mount(el, el) { return () => {} }\n`,
  unclosed: `export function mount(el) {\n  const x = <div>\n  return () => {}\n}\n`,
}
for (const [name, src] of Object.entries(cases)) {
  try {
    await esbuild.transform(src, { loader: 'ts', format: 'esm', target: 'esnext', sourcefile: 'artifact.ts', sourcemap: 'external', sourcesContent: false, logLevel: 'silent', logLimit: 0, tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } } })
    console.log(name, 'NO ERROR')
  } catch (e) {
    console.log('===', name)
    console.log(JSON.stringify(e.errors, null, 1))
  }
}
