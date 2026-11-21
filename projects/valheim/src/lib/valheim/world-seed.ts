import { getStableHashCode } from './stable-hash.ts'
import { UnityRandom } from './unity-random.ts'

export interface ValheimWorldSeedState {
  seedName: string
  seed: number
  offset0: number
  offset1: number
  offset2: number
  offset3: number
  offset4: number
  riverSeed: number
  streamSeed: number
}

export function createWorldSeedState(seedName: string): ValheimWorldSeedState {
  const seed = seedName ? getStableHashCode(seedName) : 0
  const random = new UnityRandom(seed)

  return {
    seedName,
    seed,
    offset0: random.intRange(-10_000, 10_000),
    offset1: random.intRange(-10_000, 10_000),
    offset2: random.intRange(-10_000, 10_000),
    offset3: random.intRange(-10_000, 10_000),
    riverSeed: random.intRange(-2_147_483_648, 2_147_483_647),
    streamSeed: random.intRange(-2_147_483_648, 2_147_483_647),
    offset4: random.intRange(-10_000, 10_000),
  }
}
