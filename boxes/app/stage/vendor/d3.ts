/**
 * The `d3` entry of the registry: the modules an artifact may reach for, under one bare
 * specifier, so `import { scaleLinear } from 'd3'` works and the rest of d3 is not shipped.
 */

// Side effect: adds `.transition()` to selections.
import 'd3-transition'

export * from 'd3-array'
export * from 'd3-axis'
export * from 'd3-force'
export * from 'd3-format'
export * from 'd3-hierarchy'
export * from 'd3-interpolate'
export * from 'd3-scale'
export * from 'd3-scale-chromatic'
export * from 'd3-selection'
export * from 'd3-shape'
export * from 'd3-time-format'
