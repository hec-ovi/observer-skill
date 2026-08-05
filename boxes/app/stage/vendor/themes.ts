/**
 * The two ECharts themes, `observer-light` and `observer-dark`.
 *
 * This is the only place chart styling is decided. An artifact that sets no colours, radii,
 * or fonts already matches the page in both modes: the corners come from `--radius`, the
 * tooltip is a `--surface` panel with the page's own shadow, and the type is the page's.
 *
 * Two weights of hairline. Grid lines sit at `--border`, which is a low-alpha hairline made
 * for separating panels and disappears behind data on purpose. Anything that has to be read
 * as a line of its own (axis, tick, edge, tooltip frame) takes `--border-strong`.
 */

import { readVizTokens, type VizTokens } from './tokens.ts'

const TEXT_SIZE = 12

export type VizTheme = Record<string, unknown>

export function makeTheme(t: VizTokens): VizTheme {
  const label = { color: t.textDim, fontFamily: t.font, fontSize: TEXT_SIZE }
  const axis = {
    axisLine: { show: true, lineStyle: { color: t.borderStrong, width: 1 } },
    axisTick: { show: true, lineStyle: { color: t.borderStrong }, length: 4 },
    axisLabel: { ...label, margin: 8 },
    splitLine: { show: true, lineStyle: { color: t.border, width: 1, type: 'solid' } },
    minorSplitLine: { show: false },
    splitArea: { show: false },
    nameTextStyle: label,
  }

  return {
    darkMode: t.dark,
    color: t.series,
    backgroundColor: 'transparent',

    textStyle: { fontFamily: t.font, fontSize: TEXT_SIZE, color: t.text },

    // Every axis of these types, on every chart.
    categoryAxis: { ...axis, splitLine: { show: false } },
    valueAxis: axis,
    timeAxis: axis,
    logAxis: axis,

    // v6 keeps labels and axis names inside the grid by itself; `containLabel` is legacy.
    grid: { left: 48, right: 16, top: 24, bottom: 32, borderWidth: 0 },

    title: {
      textStyle: { color: t.text, fontFamily: t.font, fontWeight: 600, fontSize: 14 },
      subtextStyle: label,
    },

    legend: {
      textStyle: label,
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
      borderRadius: t.radius,
      selectorLabel: { borderRadius: t.radius, borderColor: t.borderStrong, color: t.textDim },
    },

    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.borderStrong,
      borderWidth: 1,
      borderRadius: t.radius,
      padding: [6, 8],
      textStyle: { color: t.text, fontFamily: t.font, fontSize: TEXT_SIZE },
      axisPointer: { lineStyle: { color: t.borderStrong }, crossStyle: { color: t.borderStrong } },
      // The tooltip is a DOM node, so the page's own shadow applies to it directly.
      extraCssText: `box-shadow: ${t.shadow};`,
    },

    // Series-type keys, merged per series subtype.
    bar: { itemStyle: { borderRadius: t.radius, borderWidth: 0 }, barMaxWidth: 40 },
    line: {
      symbol: 'circle',
      symbolSize: 5,
      showSymbol: false,
      lineStyle: { width: 2, cap: 'round', join: 'round' },
      emphasis: { focus: 'series' },
    },
    scatter: { symbol: 'circle', symbolSize: 6, itemStyle: { opacity: 0.8 } },
    pie: {
      itemStyle: { borderRadius: t.radius, borderWidth: 1, borderColor: t.surface },
      label: { color: t.textDim, fontFamily: t.font },
    },
    heatmap: { itemStyle: { borderRadius: t.radius, borderWidth: 0 } },
    graph: {
      lineStyle: { color: t.borderStrong },
      label: { color: t.textDim, fontFamily: t.font },
    },
    custom: { itemStyle: { borderRadius: t.radius } },

    dataZoom: {
      borderColor: t.borderStrong,
      textStyle: { color: t.textDim },
      handleStyle: { color: t.surface, borderColor: t.borderStrong },
      brushStyle: { color: t.border },
    },

    visualMap: { textStyle: label },

    animationDuration: 400,
    animationDurationUpdate: 250,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
  }
}

/** Both themes, from the tokens the document is carrying right now. */
export function buildThemes(): { light: VizTheme; dark: VizTheme } {
  return { light: makeTheme(readVizTokens('light')), dark: makeTheme(readVizTokens('dark')) }
}
