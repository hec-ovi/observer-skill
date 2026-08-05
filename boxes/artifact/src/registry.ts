/**
 * The three libraries the page loads once and shares with every artifact. They stay out of
 * the bundle as bare imports; the stage resolves them. Adding one is a line here and a line
 * in CONTRACT.md.
 */

export const ARTIFACT_REGISTRY = ['echarts', 'd3', 'katex'] as const

export type RegistryName = (typeof ARTIFACT_REGISTRY)[number]

export const REGISTRY_LIST = ARTIFACT_REGISTRY.join(', ')

export function isRegistryName(specifier: string): specifier is RegistryName {
  return (ARTIFACT_REGISTRY as readonly string[]).includes(specifier)
}

/** `echarts/core` and friends: the right package, a subpath the page does not serve. */
export function registrySubpathRoot(specifier: string): RegistryName | null {
  return ARTIFACT_REGISTRY.find((name) => specifier.startsWith(`${name}/`)) ?? null
}
