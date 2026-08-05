import { build } from '#artifact'
const home = '/tmp/claude-1000/-home-hec-workspace-observer-skill/a1dab938-a998-40d3-9079-2a770a463d3f/scratchpad/out'
const cases: Record<string, string> = {
  'unused-bad-import': `import { groupBy } from 'lodash'
export const meta = { title: 'Bars', kind: 'chart' }
export function mount(el) { el.textContent = 'x'; return () => {} }
`,
  'commonjs': `const d3 = require('d3')
export const meta = { title: 'Bars', kind: 'chart' }
export function mount(el) { d3.select(el); return () => {} }
`,
  'type-only-import': `import type { EChartsOption } from 'echarts'
import * as echarts from 'echarts'
export const meta = { title: 'Bars', kind: 'chart' }
export function mount(el: HTMLElement) {
  const option: EChartsOption = { series: [] }
  const c = echarts.init(el)
  c.setOption(option)
  return () => c.dispose()
}
`,
  'emoji-same-line': `export const meta = { title: 'Bars', kind: 'chart' }
export function mount(el) { el.textContent = '📈📈📈'; const bad = { ; return () => {} }
`,
  'emoji-check-line': `export const meta = { title: 'Bars', kind: 'chart' }
export function mount(el) { el.textContent = '📈📈📈'; el.style.borderRadius = '4px'; return () => {} }
`,
}
for (const [name, source] of Object.entries(cases)) {
  const r = await build({ sessionId: 's', id: name, source, home })
  console.error(`\n===== ${name}`)
  console.error(r.ok ? `ok ${r.bytes}` : JSON.stringify(r.errors, null, 1))
}
