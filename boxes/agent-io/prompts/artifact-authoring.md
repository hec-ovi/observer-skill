# Writing a visual

A visual is one ES module. You write it, `build` compiles it and runs it in the real page,
and you get back either line-accurate errors or a picture to look at. Iterate until the
picture is right, then `link` it to its concept.

## The module

```ts
export const meta = {
  title: 'Attention is a weighted average',
  kind: 'diagram',           // chart | dataviz | diagram | simulation
  caption: 'Values are illustrative',   // optional, one line, only when it earns its place
}

export function mount(el, ctx) {
  // draw into el
  return () => { /* tear everything down */ }
}
```

`mount` gets an empty element sized by the stage, and returns a function that undoes
everything it did. The teardown is not optional: it runs on every path out, and a leaked
observer or interval outlives the artifact.

## `ctx`

```ts
{
  theme: {
    mode: 'light' | 'dark',
    surface, surfaceRaised, text, textDim, border, accent,   // colour strings
    series: string[],        // categorical ramp, eight colours, legible in both modes
    font, fontMono,          // font stacks, for canvas and SVG text
    motionMs: number,        // 0 when the user asked for reduced motion
  },
  onTheme(cb),               // cb(theme) when the user switches light and dark
  time: number,              // the video second this was opened at
  size: { width, height },
  onResize(cb),              // cb({width, height})
}
```

Never hardcode a colour, a font, or a duration. Everything visible comes from `ctx.theme`,
which is why one build serves both themes.

## What you can import

Three, and nothing else. Any other import fails the build.

```ts
import * as echarts from 'echarts'
import { scaleLinear, select, line, forceSimulation } from 'd3'
import { render } from 'katex'
```

- **echarts** for configured charts, large series, and anything interactive out of the box.
  Bar, line, scatter, pie, heatmap, graph, and custom series are available, with grid,
  tooltip, legend, title, dataset, dataZoom, visualMap, markLine, markPoint, and graphic.
- **d3** for bespoke geometry: forces, hierarchies, custom shapes, scales and axes you drive
  yourself. Selection, scale, axis, shape, array, format, force, hierarchy, interpolate,
  scale-chromatic, time-format, and transition are available.
- **katex** for equations. Its CSS and fonts are already loaded by the page.

## ECharts

```ts
const chart = echarts.init(el, ctx.theme.mode === 'dark' ? 'observer-dark' : 'observer-light')
const option = { /* ... */ }
chart.setOption(option)

ctx.onTheme((t) => {
  chart.setTheme(t.mode === 'dark' ? 'observer-dark' : 'observer-light')
  chart.setOption(option, { notMerge: true })   // setTheme drops later merges; re-apply
})
ctx.onResize(() => chart.resize())

return () => chart.dispose()
```

Both themes are registered by the page and carry the tokens, so a chart that uses no
explicit colours already looks right in both. Reach into `ctx.theme.series` only when you
need to control which series gets which colour.

## D3

Build an `<svg>` sized from `ctx.size`, redraw on `ctx.onResize`, and take every colour from
`ctx.theme`. Remove the node and stop any simulation or timer in the teardown.

## KaTeX

```ts
const box = document.createElement('div')
render(String.raw`\hat{y} = \sigma(Wx + b)`, box, { displayMode: true, throwOnError: false })
el.append(box)
```

Use `String.raw` so backslashes survive. `throwOnError: false` turns a bad macro into visible
red text instead of a failed mount.

## Style rules, enforced by the build

- **No rounded corners.** `border-radius` other than `0` fails the build, including ECharts
  `borderRadius` on bars and items. The design is sharp rectangles.
- **No title inside the artifact.** The stage draws `meta.title`. A heading repeating it
  fails the build.
- **No network.** `fetch`, `XMLHttpRequest`, `WebSocket`, and dynamic `import()` fail the
  build. Data is embedded in the module as a constant.

## Style rules, on you

- Fill the space you are given, in both dimensions, and redraw on resize.
- Label axes with units. A number with no unit teaches nothing.
- One idea per artifact. If you need a second sentence to say what it proves, it is two
  artifacts.
- No legend the user must decode when a direct label would do. No tooltip carrying the only
  copy of an important number.
- Interaction only when moving the control is the insight. A slider on the parameter the
  whole argument turns on, yes; a zoom nobody needs, no.
- Animate only to show change over time or a process running. Respect `ctx.theme.motionMs`
  being `0`.

## Data

Never invent numbers. Use what the video gave you or what your research found. If the shape
is the point and the values do not exist, draw the shape, label the axes qualitatively, and
put `caption: 'Values are illustrative'` on the meta. A plausible-looking chart of made-up
data is the worst thing you can put on that screen.

## The loop

1. `build` with a stable `id`. Rebuilding the same id replaces it.
2. On `ok: false`, read the errors. Each names the line and what to write instead. Fix and
   build again with the same id.
3. On `ok: true`, look at the snapshot that comes back with the result. Ask whether it
   explains the thing. Empty space, an unreadable axis, a series in one colour, a chart the
   size of a stamp: fix and build again.
4. `link` it to its concept and the stretch of video where it means something. An artifact
   linked to nothing is never shown.

## What the errors mean

| Error | Fix |
|---|---|
| `import "X" is not available` | Only `echarts`, `d3`, `katex` exist. Write it yourself or drop it. |
| `border-radius must be 0` | Remove the rounding. This is a design rule, not a preference. |
| `heading repeats meta.title` | Delete the heading. The stage draws the title. |
| `network access is not allowed` | Embed the data in the module. |
| `mount must be exported as a function` | Export `mount(el, ctx)` and `meta`. |
| A mount error from the sandbox | The module threw while running. The stack is against your source; fix and rebuild. |
| `ARTIFACT_TIMEOUT` | `mount` never finished. An await that never resolves, or an infinite loop. |
| `PAGE_NOT_OPEN` | Verification runs in the user's page. Ask them to open the session url. |
