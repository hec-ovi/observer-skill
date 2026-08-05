/**
 * Every provider, in the order `auto` walks them: the two caption routes first because they
 * are free and exact, speech recognition next because it costs time and money, a file the
 * user supplied last because it is only there when it was asked for.
 */

import type { Provider } from './provider.ts'
import type { ProviderId } from './schema.ts'
import { captions } from './providers/captions.ts'
import { endpointAsr } from './providers/endpoint-asr.ts'
import { file } from './providers/file.ts'
import { innertube } from './providers/innertube.ts'

export const PROVIDERS: Provider[] = [captions, innertube, endpointAsr, file]

export function providerById(id: ProviderId): Provider | undefined {
  return PROVIDERS.find((provider) => provider.id === id)
}
