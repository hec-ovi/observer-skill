/**
 * A module built against a library the page does not serve.
 *
 * A browser fails this while resolving the import, before a line of the module runs, and
 * that rejection is the only thing the loader sees. Under the test runner every bare
 * specifier resolves from `node_modules`, so the fixture rejects its own import with the
 * message an engine produces for an unmapped specifier.
 */

export {}

throw new TypeError(
  `Failed to resolve module specifier 'echarts'. Relative references must start with either "/", "./", or "../".`,
)
