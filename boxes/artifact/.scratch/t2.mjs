import * as esbuild from 'esbuild'
import { parse } from 'acorn'
import * as walk from 'acorn-walk'

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64 = new Map([...CHARS].map((c, i) => [c, i]))

function decodeMappings(mappings) {
  const lines = []
  let srcLine = 0, srcCol = 0
  for (const group of mappings.split(';')) {
    const segs = []
    let genCol = 0
    if (group) for (const seg of group.split(',')) {
      let i = 0
      const nums = []
      while (i < seg.length) {
        let shift = 0, value = 0, cont = true
        while (cont) {
          const d = B64.get(seg[i++])
          cont = (d & 32) !== 0
          value += (d & 31) * (2 ** shift)
          shift += 5
        }
        const neg = value & 1
        value >>= 1
        nums.push(neg ? -value : value)
      }
      genCol += nums[0]
      if (nums.length >= 4) { srcLine += nums[2]; srcCol += nums[3]; segs.push([genCol, srcLine, srcCol]) }
    }
    lines.push(segs)
  }
  return lines
}

const src = `import * as echarts from 'echarts'

interface Foo { a: number }

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
const map = decodeMappings(JSON.parse(r.map).mappings)
const ast = parse(r.code, { ecmaVersion: 'latest', sourceType: 'module', locations: true })
function toOrig(line, col) {
  const segs = map[line - 1] ?? []
  let best = null
  for (const s of segs) { if (s[0] <= col) best = s; else break }
  if (!best) return null
  return { line: best[1] + 1, column: best[2] + 1 }
}
walk.simple(ast, {
  Property(n) {
    if (n.key.name === 'borderRadius' || n.key.name === 'title') {
      console.log(n.key.name, 'gen', n.loc.start.line, n.loc.start.column, '->orig', toOrig(n.loc.start.line, n.loc.start.column))
    }
  },
})
console.log(r.code.split('\n').map((l,i)=>`${i+1}: ${l}`).join('\n'))
