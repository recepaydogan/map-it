import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { generateSeedResources, mergeResourceSources, packResourcePoints, shouldPredictServerResources, unpackResourcePoints, resourceZoneSeed, type ResourceVegetationRule } from '../../src/lib/valheim/seed-resources.ts'
import { getStableHashCode } from '../../src/lib/valheim/stable-hash.ts'
import { ValheimWorldGenerator } from '../../src/lib/valheim/world-generator.ts'
import { createWorldSeedState } from '../../src/lib/valheim/world-seed.ts'
import { buildResourceStateIndex, type CatalogResourceNode } from '../../src/lib/valheim/resource-state.ts'

const file = (name: string) => JSON.parse(readFileSync(new URL(`../../public/game-data/${name}`, import.meta.url), 'utf8'))
const shipped = file('seed-resource-rules.json').rules as ResourceVegetationRule[]
const berry = shipped.find((rule) => rule.name === 'Lingonberries')!
const flatRule: ResourceVegetationRule = {
  ...berry, biome: 1, biomeArea: 3, min: 2, max: 2, groupSizeMin: 3, groupSizeMax: 3,
  inForest: 0, minOceanDepth: 0, maxOceanDepth: 0, minAltitude: 0, maxAltitude: 1000,
}

test('only a confirmed remote world without a local database uses resource predictions', () => {
  const localSave = { databasePath: 'world/_main.3.db2' }
  const noSave = { databasePath: null }
  assert.equal(shouldPredictServerResources(localSave, true), false)
  assert.equal(shouldPredictServerResources(localSave, false), false)
  assert.equal(shouldPredictServerResources(noSave, true), false)
  assert.equal(shouldPredictServerResources(noSave, null), false)
  assert.equal(shouldPredictServerResources(null, false), false)
  assert.equal(shouldPredictServerResources(noSave, false), true)
})

function flatGenerator() {
  const generator = new ValheimWorldGenerator(createWorldSeedState('Valheim'))
  generator.getBiome = () => 'meadows'
  generator.getHeightAndVegetation = () => ({ height: 40, vegetation: 0.5 })
  return generator
}

test('shipped rules resolve actual prefabs, cover outdoor materials and preserve source item mappings', () => {
  assert.equal(berry.prefabName, 'LingonberryBush')
  assert.notEqual(resourceZoneSeed(1234, 2, -3, berry.prefabName), resourceZoneSeed(1234, 2, -3, berry.name))
  assert.equal(resourceZoneSeed(1234, 2, -3, berry.prefabName),
    (1234 + 2 * 4271 - 3 * 9187 + getStableHashCode('LingonberryBush')) | 0)
  const materials = new Set(shipped.flatMap((rule) => rule.materials))
  for (const key of ['lingonberry', 'raspberry', 'blueberries', 'cloudberry', 'mushroom', 'mushroomjotunpuffs',
    'copperore', 'tinore', 'silverore', 'obsidian', 'flint', 'thistle', 'carrotseeds', 'turnipseeds', 'kaleseeds']) {
    assert.ok(materials.has(key), key)
  }
  assert.ok(!materials.has('wood'))
  assert.ok(!materials.has('royaljelly'), 'Dungeon-only sources must not be invented as vegetation')
  const catalog = file('planner-catalog.json').resourceNodes as Record<string, CatalogResourceNode>
  for (const rule of shipped) {
    const node = catalog[rule.prefabName.toLowerCase()]
    assert.ok(node, rule.prefabName)
    for (const material of rule.materials) assert.ok(node.items.some((item) => item.prefabName.toLowerCase() === material))
  }
})

test('changing the rule label cannot change the prefab RNG stream', () => {
  const generator = flatGenerator()
  const first = generateSeedResources(generator, [flatRule], { radius: 0 })
  assert.equal(first.lingonberry.length / 2, 6)
  assert.deepEqual(first, generateSeedResources(generator, [{ ...flatRule, name: 'Unrelated display label' }], { radius: 0 }))
  assert.notDeepEqual(first, generateSeedResources(generator, [{ ...flatRule, prefabName: 'WrongPrefab' }], { radius: 0 }))
})

test('forced deposits retry rejected positions and stop after reaching the requested quota', () => {
  const generator = flatGenerator()
  let samples = 0
  generator.getHeightAndVegetation = () => ({ height: ++samples <= 2 ? 0 : 40, vegetation: 0.5 })
  const rule = { ...flatRule, min: 1, max: 1, groupSizeMin: 1, groupSizeMax: 1 }
  assert.equal(generateSeedResources(generator, [rule], { radius: 0 }).lingonberry.length, 0)
  samples = 0
  assert.equal(generateSeedResources(generator, [{ ...rule, forcePlacement: 1 }], { radius: 0 }).lingonberry.length / 2, 1)
  assert.equal(samples, 3)
})

test('biome, height, vegetation, slope, ocean depth and forest constraints reject unsuitable positions', () => {
  for (const changes of [
    { biome: 8 }, { minAltitude: 100 }, { minVegetation: 0.7, maxVegetation: 1 },
    { minTilt: 20 }, { minOceanDepth: 5, maxOceanDepth: 10 },
    { inForest: 1, forestTresholdMin: 100, forestTresholdMax: 200 },
  ]) {
    const points = generateSeedResources(flatGenerator(), [{ ...flatRule, ...changes }], { radius: 0 })
    assert.equal(points.lingonberry?.length ?? 0, 0, JSON.stringify(changes))
  }
})

test('alt biome-only rules require their sector and blocked rules cannot leak into other sectors', () => {
  assert.equal(generateSeedResources(flatGenerator(), [{ ...flatRule, altBiomeParent: 'Mushroom' }], { radius: 0 }).lingonberry.length, 0)
})

test('a successful ground-tilt roll advances RNG before the next member', () => {
  const without = generateSeedResources(flatGenerator(), [flatRule], { radius: 0 }).lingonberry
  const withTilt = generateSeedResources(flatGenerator(), [{ ...flatRule, chanceToUseGroundTilt: 1 }], { radius: 0 }).lingonberry
  assert.deepEqual(withTilt.slice(0, 2), without.slice(0, 2))
  assert.notDeepEqual(withTilt.slice(2, 4), without.slice(2, 4))
})

test('saved generated regions override predictions, even for picked and destroyed resources', () => {
  const catalog: Record<string, CatalogResourceNode> = {
    blueberrybush: { prefabName: 'BlueberryBush', kind: 'pickable', respawnTimeMinutes: 300, hideWhenPicked: true,
      items: [{ prefabName: 'Blueberries', amountMin: 1, amountMax: 1, chance: 1 }] },
  }
  const saved = buildResourceStateIndex({
    netTimeSeconds: 60,
    worldTimeTicks: 600_000_000,
    generatedZones: new Int32Array([0, 0, 1, 0]),
    nodes: {
      count: 2,
      prefabHashes: new Int32Array([getStableHashCode('BlueberryBush'), getStableHashCode('BlueberryBush')]),
      x: new Float32Array([1, 2]), z: new Float32Array([1, 2]),
      picked: new Uint8Array([0, 1]), pickedTimeTicks: new Float64Array([0, 600_000_000]),
      disabled: new Uint8Array(2), damaged: new Uint8Array(2),
    },
  }, catalog, { blueberries: ['BlueberryBush'] })
  const predicted = { blueberries: packResourcePoints([{ x: 1, z: 1 }, { x: 2, z: 2 }, { x: 64, z: 1 }, { x: 128, z: 1 }]),
    copperore: packResourcePoints([{ x: 3, z: 3 }, { x: 128, z: 2 }]) }
  const merged = mergeResourceSources(saved, predicted)
  assert.deepEqual(merged.pointsForItem('blueberries'), [{ x: 1, z: 1 }, { x: 128, z: 1 }])
  assert.deepEqual(merged.pointsForItem('copperore'), [{ x: 128, z: 2 }], 'No ore in a generated zone must stay absent')
  assert.deepEqual(merged.options.find((option) => option.itemPrefab === 'blueberries'), { itemPrefab: 'blueberries', count: 2, predictedCount: 1 })
  const server = mergeResourceSources(null, predicted)
  assert.deepEqual(server.pointsForItem('blueberries'), unpackResourcePoints(predicted.blueberries))
  assert.equal(server.options[0].predictedCount, 4)
  const failedPrediction = mergeResourceSources(saved, {})
  assert.deepEqual(failedPrediction.pointsForItem('blueberries'), [{ x: 1, z: 1 }])
})
