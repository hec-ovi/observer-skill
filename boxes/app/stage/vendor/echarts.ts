/**
 * The `echarts` entry of the registry: one tree-shaken build, shared by the page and every
 * artifact through the import map.
 *
 * Registering the charts and components here is what decides the allowlist in the artifact
 * authoring guide. Registering the themes here is what lets an artifact draw a chart that
 * carries no colours of its own.
 */

import { BarChart, CustomChart, GraphChart, HeatmapChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  MarkPointComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
  VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { LabelLayout, UniversalTransition } from 'echarts/features'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'
import { buildThemes } from './themes.ts'

echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  PieChart,
  HeatmapChart,
  GraphChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  TransformComponent,
  MarkLineComponent,
  MarkPointComponent,
  DataZoomComponent,
  VisualMapComponent,
  GraphicComponent,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer,
  SVGRenderer,
])

const themes = buildThemes()
echarts.registerTheme('observer-light', themes.light)
echarts.registerTheme('observer-dark', themes.dark)

// The snapshot path asks the library which chart owns a container. Reaching it through the
// document keeps that lookup on the one copy every artifact shares.
;(globalThis as { echarts?: typeof echarts }).echarts = echarts

export * from 'echarts/core'
