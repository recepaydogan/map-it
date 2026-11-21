import assert from 'node:assert/strict'
import { getStableHashCode } from '../src/lib/valheim/stable-hash.ts'
import { UnityRandom } from '../src/lib/valheim/unity-random.ts'
import { createWorldSeedState } from '../src/lib/valheim/world-seed.ts'
import { perlinNoise } from '../src/lib/valheim/perlin-noise.ts'
import { ValheimWorldGenerator } from '../src/lib/valheim/world-generator.ts'
import { mergeWorldPoints } from '../src/lib/valheim/world-pregeneration.ts'
import { ValheimFastNoise } from '../src/lib/valheim/fast-noise.ts'

const random = new UnityRandom(1234)
assert.deepEqual(
  Array.from({ length: 5 }, () => random.nextUint()),
  [3463400838, 3496203776, 3452947669, 1278673611, 4169168310],
  'Unity Xorshift128 sequence must match the published Unity test vector',
)

const fastNoise = new ValheimFastNoise()
const fastNoiseVectors = [
  [0, 0, 0.20249998710303885, 0],
  [0.1, 0.2, 0.20448114440003662, -0.00416674998375051],
  [100, 200, 0.20249999026472526, -0.11185336265588694],
  [1234.567, 890.123, 0.008255706851695948, -0.33961508496523196],
  [-5000.25, 6000.75, 0.19873069140409974, 0.23759764733056882],
]
for (const [x, y, expectedCellular, expectedSimplex] of fastNoiseVectors) {
  assert.equal(fastNoise.getCellular(x, y), expectedCellular)
  assert.equal(fastNoise.getSimplexFractal(x, y), expectedSimplex)
}

const integerRandom = new UnityRandom(1234)
assert.deepEqual(
  Array.from({ length: 5 }, () => integerRandom.intRange(0, 2_147_483_647)),
  [1315917191, 1348720129, 1305464022, 1278673611, 2021684663],
  'Unity integer Range sequence must match the published Unity test vector',
)

const floatRandom = new UnityRandom(1234)
assert.deepEqual(
  Array.from({ length: 5 }, () => floatRandom.floatRange(-10_000, 10_000)),
  [-7391.068359375, -5599.3671875, -2468.7705078125, 1404.5439453125, 9928.154296875],
  'Unity float Range sequence must match the native 23-bit float routine',
)

const circleRandom = new UnityRandom(1234)
assert.deepEqual(
  Array.from({ length: 5 }, () => circleRandom.insideUnitCircle()),
  [
    { x: 0.3201434314250946, y: 0.3428407907485962 },
    { x: -0.5391731858253479, y: 0.5286960601806641 },
    { x: 0.8772938251495361, y: -0.01980426535010338 },
    { x: 0.5528748035430908, y: -0.21767207980155945 },
    { x: 0.6967493295669556, y: -0.14435283839702606 },
  ],
  'Unity insideUnitCircle sequence must match the native UnityPlayer routine',
)

assert.equal(getStableHashCode(''), 371857150)
assert.equal(getStableHashCode('Eikthyr'), -938588874)

const first = createWorldSeedState('Valheim')
const second = createWorldSeedState('Valheim')
assert.deepEqual(first, second, 'World seed state must be deterministic')
assert.equal(first.seed, getStableHashCode('Valheim'))

const perlinVectors = [
  [0, 0, 0.46527308225631714],
  [0.1, 0.2, 0.4956870973110199],
  [1, 1, 0.46527308225631714],
  [-0.1, 0.2, 0.4956870973110199],
  [10.5, 20.25, 0.5582868456840515],
  [1234.567, 890.123, 0.54011070728302],
  [-100, -200, 0.46527308225631714],
]

for (const [x, y, expected] of perlinVectors) {
  assert.equal(perlinNoise(x, y), expected)
}

const generator = new ValheimWorldGenerator(first)
assert.equal(generator.getBiome(0, 0), 'meadows')
assert.equal(generator.getBiome(0, -10_000), 'ashlands')
assert.equal(generator.getBiome(0, 10_000), 'deep-north')
assert.ok(generator.getBaseHeight(10_500, 0) <= -1.99)
assert.deepEqual(
  mergeWorldPoints([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 2_000, y: 0 },
  ], 800),
  [
    { x: 50, y: 0 },
    { x: 2_000, y: 0 },
  ],
)

// 1.0 keeps tall northern terrain in Deep North, where the new boss can spawn.
let highNorthSamples = 0
for (let y = 8200; y <= 10000; y += 200) for (let x = -3000; x <= 3000; x += 200) {
  if (generator.isDeepNorth(x, y) && generator.getBaseHeight(x, y) > 0.4) {
    highNorthSamples++
    assert.equal(generator.getBiome(x, y), 'deep-north')
  }
}
assert.ok(highNorthSamples > 0)
console.log('World generator primitives valid.')
console.log(JSON.stringify(first, null, 2))
