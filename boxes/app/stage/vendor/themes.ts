/**
 * The two ECharts themes, `observer-light` and `observer-dark`.
 *
 * This is the only place chart styling is decided. An artifact that sets no colours, fonts,
 * or radii already matches the page in both modes, and the two library defaults that are
 * rounded (`tooltip.borderRadius: 4`, `legend.selectorLabel.borderRadius: 10`) are zeroed
 * here so a square corner is never the artifact author's problem.
 */

import { readVizTokens, type VizTokens } from './tokens.ts'

/** Nothing is rounded, matching `--radius: 0`. */
const RADIUS = 0
const TEXT_SIZE = 12

export type VizTheme = Record<string, unknown>

export function makeTheme(t: VizTokens): VizTheme {
  const label = { color: t.textDim, fontFamily: t.font, fontSize: TEXT_SIZE }
  const axis = {
    axisLine: { show: true, lineStyle: { color: t.border, width: 1 } },
    axisTick: { show: true, lineStyle: { color: t.border }, length: 4 },
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

    grid: { left: 48, right: 16, top: 24, bottom: 32, containLabel: true, borderWidth: 0 },

    title: {
      textStyle: { color: t.text, fontFamily: t.font, fontWeight: 600, fontSize: 14 },
      subtextStyle: label,
    },

    legend: {
      textStyle: label,
      icon: 'rect',
      itemWidth: 10,
      itemHeight: 10,
      borderRadius: RADIUS,
      selectorLabel: { borderRadius: RADIUS, borderColor: t.border, color: t.textDim },
    },

    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.border,
      borderWidth: 1,
      borderRadius: RADIUS,
      padding: [6, 8],
      textStyle: { color: t.text, fontFamily: t.font, fontSize: TEXT_SIZE },
      axisPointer: { lineStyle: { color: t.border }, crossStyle: { color: t.border } },
    },

    // Series-type keys, merged per series subtype.
    bar: { itemStyle: { borderRadius: RADIUS, borderWidth: 0 }, barMaxWidth: 40 },
    line: {
      symbol: 'rect',
      symbolSize: 5,
      showSymbol: false,
      lineStyle: { width: 2, cap: 'butt', join: 'miter' },
      emphasis: { focus: 'series' },
    },
    scatter: { symbol: 'rect', symbolSize: 6, itemStyle: { opacity: 0.8 } },
    pie: {
      itemStyle: { borderRadius: RADIUS, borderWidth: 1, borderColor: t.surface },
      label: { color: t.textDim, fontFamily: t.font },
    },
    heatmap: { itemStyle: { borderRadius: RADIUS, borderWidth: 0 } },
    graph: { lineStyle: { color: t.border }, label: { color: t.textDim, fontFamily: t.font } },
    custom: { itemStyle: { borderRadius: RADIUS } },

    dataZoom: {
      borderColor: t.border,
      textStyle: { color: t.textDim },
      handleStyle: { color: t.surface, borderColor: t.border },
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
