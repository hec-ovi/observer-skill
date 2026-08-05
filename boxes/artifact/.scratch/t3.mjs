import * as esbuild from 'esbuild'

// syntax error shape
try {
  await esbuild.transform("const a = 1\nconst b = {\nlet c = 2\n", { loader: 'ts', format: 'esm', sourcemap: 'external', sourcefile: 'artifact.ts', logLevel: 'silent', logLimit: 0 })
} catch (e) {
  console.log('errors:', JSON.stringify(e.errors, null, 1))
}

// bundle with externals
const source = `import * as echarts from 'echarts'
export const meta = { title: 'T', kind: 'chart' }
export function mount(el) { const c = echarts.init(el); return () => c.dispose() }
`
const plugin = {
  name: 'virtual-entry',
  setup(build) {
    build.onResolve({ filter: /^artifact$/ }, () => ({ path: 'artifact', namespace: 'agent' }))
    build.onLoad({ filter: /.*/, namespace: 'agent' }, () => ({ contents: source, loader: 'ts' }))
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.namespace !== 'agent') return null
      if (args.kind === 'entry-point') return null
      if (['echarts','d3','katex'].includes(args.path)) return { path: args.path, external: true }
      return { errors: [{ text: `nope ${args.path}` }] }
    })
  },
}
const res = await esbuild.build({
  entryPoints: ['artifact'], bundle: true, format: 'esm', platform: 'browser',
  target: ['chrome120','firefox121','safari17'], sourcemap: 'inline', sourcesContent: true,
  write: false, outfile: 'bundle.js', minify: false, treeShaking: true, legalComments: 'none',
  logLevel: 'silent', logLimit: 0, external: ['echarts','d3','katex'],
  plugins: [plugin],
})
console.log('outputs', res.outputFiles.length, res.outputFiles[0].path, res.outputFiles[0].contents.length)
console.log(res.outputFiles[0].text.slice(0, 400))
