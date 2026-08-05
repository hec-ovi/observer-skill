import * as esbuild from 'esbuild'
const src = `import * as echarts from 'echarts'

interface Foo {
  a: number
  b: string
}

export const meta = {
  title: 'Hello',
  kind: 'chart' as const,
}

export function mount(el: HTMLElement, ctx: any): () => void {
  const chart = echarts.init(el)
  chart.setOption({ series: [{ type: 'bar', itemStyle: { borderRadius: 8 } }] })
  return () => chart.dispose()
}
`
const r = await esbuild.transform(src, { loader: 'ts', format: 'esm', sourcemap: 'external', sourcefile: 'artifact.ts', logLevel: 'silent', logLimit: 0 })
console.log(JSON.stringify(r.code))
console.log('---MAP---')
const m = JSON.parse(r.map)
console.log(Object.keys(m), m.sources, m.mappings.slice(0, 400))
console.log('---warnings', r.warnings)
