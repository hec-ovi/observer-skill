/**
 * player: the video, and where the user is in it. `createPlayer` picks a provider from the
 * source and returns one controllable player; everything downstream is keyed to `time()`.
 */

export { createPlayer } from './create.ts'
export { createFakePlayer, fakeProvider } from './fake.ts'
export { POSITION_TICK_MS } from '../schema/player.ts'

export type { FakePlayer } from './fake.ts'
export type {
  Player,
  PlayerError,
  PlayerErrorCode,
  PlayerOptions,
  PlayerProvider,
  PlayerSource,
  PlayerState,
  Position,
  ReadyInfo,
} from '../schema/player.ts'
