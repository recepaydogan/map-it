import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getStableHashCode } from '../../src/lib/valheim/stable-hash.ts'
import {
  GAME_TICKS_PER_SECOND,
  parseWorldDatabase,
} from '../../src/lib/valheim/world-save-format.ts'
import {
  buildResourceStateIndex,
  worldToZone,
  type CatalogResourceNode,
} from '../../src/lib/valheim/resource-state.ts'
import type { SavePrefabType, SaveResourceState } from '../../src/types/world-save.ts'

const TICKS_PER_GAME_MINUTE = 60 * GAME_TICKS_PER_SECOND

/** Little-endian writer mirroring the .NET BinaryWriter layout of .db saves. */
class SaveWriter {
  private readonly chunks: number[] = []

  byte(value: number): this {
    this.chunks.push(value & 0xff)
    return this
  }

  private pushBuffer(buffer: ArrayBuffer): this {
    for (const byte of new Uint8Array(buffer)) this.chunks.push(byte)
    return this
  }

  uint16(value: number): this {
    const view = new DataView(new ArrayBuffer(2))
    view.setUint16(0, value, true)
    return this.pushBuffer(view.buffer)
  }

  int16(value: number): this {
    const view = new DataView(new ArrayBuffer(2))
    view.setInt16(0, value, true)
    return this.pushBuffer(view.buffer)
  }

  int32(value: number): this {
    const view = new DataView(new ArrayBuffer(4))
    view.setInt32(0, value, true)
    return this.pushBuffer(view.buffer)
  }

  single(value: number): this {
    const view = new DataView(new ArrayBuffer(4))
    view.setFloat32(0, value, true)
    return this.pushBuffer(view.buffer)
  }

  double(value: number): this {
    const view = new DataView(new ArrayBuffer(8))
    view.setFloat64(0, value, true)
    return this.pushBuffer(view.buffer)
  }

  int64(value: bigint): this {
    const view = new DataView(new ArrayBuffer(8))
    view.setBigInt64(0, value, true)
    return this.pushBuffer(view.buffer)
  }

  string(value: string): this {
    const encoded = new TextEncoder().encode(value)
    assert.ok(encoded.length < 128, 'fixture strings stay under one length byte')
    this.byte(encoded.length)
    for (const byte of encoded) this.chunks.push(byte)
    return this
  }

  buffer(): ArrayBuffer {
    return Uint8Array.from(this.chunks).buffer
  }
}

const FLAG_CONNECTION = 0x1
const FLAG_FLOATS = 0x2
const FLAG_INTS = 0x10
const FLAG_LONGS = 0x20
const FLAG_STRINGS = 0x40
const FLAG_ROTATION = 0x1000

interface FixtureZdo {
  prefab: string
  x: number
  z: number
  height?: number
  rotation?: boolean | [number, number, number]
  connection?: boolean
  floats?: Array<[string, number]>
  ints?: Array<[string, number]>
  longs?: Array<[string, bigint]>
  strings?: Array<[string, string]>
}

function writeZdo(writer: SaveWriter, zdo: FixtureZdo): void {
  let flags = 0
  if (zdo.rotation) flags |= FLAG_ROTATION
  if (zdo.connection) flags |= FLAG_CONNECTION
  if (zdo.floats?.length) flags |= FLAG_FLOATS
  if (zdo.ints?.length) flags |= FLAG_INTS
  if (zdo.longs?.length) flags |= FLAG_LONGS
  if (zdo.strings?.length) flags |= FLAG_STRINGS
  writer.uint16(flags)
  writer.int16(worldToZone(zdo.x))
  writer.int16(worldToZone(zdo.z))
  writer.single(zdo.x)
  writer.single(zdo.height ?? 30)
  writer.single(zdo.z)
  writer.int32(getStableHashCode(zdo.prefab))
  if (zdo.rotation) {
    const [x, y, z] = Array.isArray(zdo.rotation) ? zdo.rotation : [0, 0, 0]
    writer.single(x).single(y).single(z)
  }
  if (zdo.connection) writer.byte(1).int32(1234)
  if (zdo.floats?.length) {
    writer.byte(zdo.floats.length)
    for (const [key, value] of zdo.floats) writer.int32(getStableHashCode(key)).single(value)
  }
  if (zdo.ints?.length) {
    writer.byte(zdo.ints.length)
    for (const [key, value] of zdo.ints) writer.int32(getStableHashCode(key)).int32(value)
  }
  if (zdo.longs?.length) {
    writer.byte(zdo.longs.length)
    for (const [key, value] of zdo.longs) writer.int32(getStableHashCode(key)).int64(value)
  }
  if (zdo.strings?.length) {
    writer.byte(zdo.strings.length)
    for (const [key, value] of zdo.strings) writer.int32(getStableHashCode(key)).string(value)
  }
}

const NET_TIME_SECONDS = 100_000
const WORLD_TICKS = NET_TIME_SECONDS * GAME_TICKS_PER_SECOND
const gameMinutesAgo = (minutes: number): bigint =>
  BigInt(WORLD_TICKS - minutes * TICKS_PER_GAME_MINUTE)

function buildFixtureDatabase(zdos: FixtureZdo[], zones: Array<[number, number]>): ArrayBuffer {
  const writer = new SaveWriter()
  writer.int32(33)
  writer.double(NET_TIME_SECONDS)
  writer.int64(777n)
  writer.int32(42)
  writer.int32(zdos.length)
  for (const zdo of zdos) writeZdo(writer, zdo)
  writer.int32(zones.length)
  for (const [zoneX, zoneY] of zones) writer.int32(zoneX).int32(zoneY)
  writer.int32(1)
  writer.int32(1)
  writer.int32(1)
  writer.string('defeated_eikthyr')
  writer.byte(1)
  writer.int32(1)
  writer.string('StartTemple')
  writer.single(0).single(30).single(0)
  writer.byte(1)
  return writer.buffer()
}

const fixturePrefabs: SavePrefabType[] = [
  { prefabName: 'RaspberryBush', componentKinds: ['pickable'] },
  { prefabName: 'Pickable_Flint', componentKinds: ['pickable'] },
  { prefabName: 'Beech1', componentKinds: ['tree'] },
  { prefabName: 'rock4_copper_frac', componentKinds: ['mine-rock'] },
  { prefabName: 'Boar', componentKinds: ['character'] },
  {
    prefabName: 'wood_wall',
    componentKinds: ['piece'],
    pieceMaterial: 'Wood',
    pieceBounds: { min: [-1, -1, -0.2], max: [1, 1, 0.2] },
  },
]

const catalogNodes: Record<string, CatalogResourceNode> = {
  raspberrybush: {
    prefabName: 'RaspberryBush',
    kind: 'pickable',
    respawnTimeMinutes: 300,
    hideWhenPicked: true,
    items: [{ prefabName: 'Raspberry', amountMin: 1, amountMax: 1, chance: 1 }],
  },
  pickable_flint: {
    prefabName: 'Pickable_Flint',
    kind: 'pickable',
    respawnTimeMinutes: 0,
    hideWhenPicked: true,
    items: [{ prefabName: 'Flint', amountMin: 1, amountMax: 1, chance: 1 }],
  },
  beech1: {
    prefabName: 'Beech1',
    kind: 'tree',
    respawnTimeMinutes: 0,
    hideWhenPicked: false,
    items: [{ prefabName: 'Wood', amountMin: 1, amountMax: 1, chance: 1 }],
  },
  rock4_copper_frac: {
    prefabName: 'rock4_copper_frac',
    kind: 'mine-rock',
    respawnTimeMinutes: 0,
    hideWhenPicked: false,
    items: [{ prefabName: 'CopperOre', amountMin: 1, amountMax: 1, chance: 1 }],
  },
}

const itemNodes: Record<string, string[]> = {
  raspberry: ['RaspberryBush'],
  flint: ['Pickable_Flint'],
  wood: ['Beech1'],
  copperore: ['rock4_copper_frac'],
}

const fixtureZdos: FixtureZdo[] = [
  { prefab: 'RaspberryBush', x: 10, z: 20 },
  {
    prefab: 'RaspberryBush',
    x: 100,
    z: 200,
    rotation: true,
    ints: [['picked', 1]],
    longs: [['picked_time', gameMinutesAgo(100)]],
  },
  {
    prefab: 'RaspberryBush',
    x: -50,
    z: -60,
    ints: [['picked', 1]],
    longs: [['picked_time', gameMinutesAgo(400)]],
  },
  { prefab: 'Pickable_Flint', x: 5, z: 5, ints: [['picked', 1]] },
  { prefab: 'Beech1', x: 300, z: 300, floats: [['health', 40.5]] },
  {
    prefab: 'rock4_copper_frac',
    x: 400,
    z: 400,
    connection: true,
    strings: [['health', 'ZmFrZS1wYWNrYWdl']],
  },
  { prefab: 'Boar', x: 12, z: 13, ints: [['level', 2]] },
  { prefab: 'wood_wall', x: 0, z: 0, longs: [['creator', 7n]] },
  { prefab: 'wood_wall', x: 4, z: 0, rotation: [0, 90, 0], longs: [['creator', 7n]] },
  { prefab: 'wood_wall', x: 100, z: 100 },
  { prefab: 'UnknownDecoration', x: 1, z: 1, floats: [['health', 5]] },
]

const fixtureZones: Array<[number, number]> = [[0, 0], [5, -3]]

test('binary fixture parses into a resource snapshot', () => {
  const database = parseWorldDatabase(
    buildFixtureDatabase(fixtureZdos, fixtureZones),
    fixturePrefabs,
  )

  assert.equal(database.databaseVersion, 33)
  assert.equal(database.resourceState.netTimeSeconds, NET_TIME_SECONDS)
  assert.equal(database.resourceState.worldTimeTicks, WORLD_TICKS)
  assert.deepEqual([...database.resourceState.generatedZones], [0, 0, 5, -3])
  assert.equal(database.generatedZoneCount, 2)
  assert.equal(database.structures.length, 1)
  assert.equal(database.structures[0].pieceCount, 2)
  assert.equal(database.structures[0].x, 2)
  assert.equal(database.structurePaths.filter(Boolean).length, 1)
  assert.match(database.structurePaths.find(Boolean) ?? '', /M-1,0\.2L1,0\.2L1,-0\.2L-1,-0\.2Z/)

  const { nodes } = database.resourceState
  assert.equal(nodes.count, 6)
  const bushHash = getStableHashCode('RaspberryBush')
  const bushIndices = [...nodes.prefabHashes].flatMap(
    (hash, index) => hash === bushHash ? [index] : [],
  )
  assert.equal(bushIndices.length, 3)
  const pickedBush = bushIndices.find((index) => nodes.x[index] === 100)
  assert.ok(pickedBush !== undefined)
  assert.equal(nodes.picked[pickedBush], 1)
  assert.equal(nodes.pickedTimeTicks[pickedBush], Number(gameMinutesAgo(100)))

  const rockIndex = [...nodes.prefabHashes].indexOf(getStableHashCode('rock4_copper_frac'))
  assert.ok(rockIndex >= 0)
  assert.equal(nodes.damaged[rockIndex], 1)
  assert.equal(nodes.picked[rockIndex], 0)

  assert.equal(database.trackedObjects.length, 1)
  assert.equal(database.trackedObjects[0].prefabName, 'Boar')
  assert.equal(database.trackedObjects[0].properties.level, 2)
  assert.equal(database.globalKeys[0], 'defeated_eikthyr')
  assert.equal(database.locations[0].prefabName, 'StartTemple')
})

test('base operations retain portal links and production state without retaining every ZDO', () => {
  const prefabs: SavePrefabType[] = [
    { prefabName: 'portal_wood', componentKinds: ['piece'] },
    { prefabName: 'smelter', componentKinds: ['conversion', 'piece'] },
    { prefabName: 'fermenter', componentKinds: ['conversion', 'piece'] },
    { prefabName: 'piece_oven', componentKinds: ['conversion', 'piece'] },
    { prefabName: 'piece_beehive', componentKinds: ['piece'] },
    { prefabName: 'windmill', componentKinds: ['conversion', 'piece'] },
  ]
  const database = parseWorldDatabase(buildFixtureDatabase([
    {
      prefab: 'portal_wood', x: 50, z: 70, rotation: [0, 90, 0], connection: true,
      longs: [['creator', 77n]], strings: [['tag', 'Home'], ['tagauthor', 'Viking']],
    },
    {
      prefab: 'smelter', x: 55, z: 72,
      floats: [['fuel', 0]], ints: [['queued', 5]], longs: [['creator', 77n]],
      strings: [['item0', 'CopperOre']],
    },
    {
      prefab: 'smelter', x: 500, z: 500,
      floats: [['fuel', 10]], ints: [['queued', 2]],
    },
    {
      prefab: 'fermenter', x: 60, z: 74,
      longs: [['creator', 77n], ['StartTime', 123_000_000n]],
      strings: [['Content', 'BarleyWineBase']],
    },
    {
      prefab: 'piece_oven', x: 61, z: 75,
      floats: [['fuel', 2], ['slot0', 42]], ints: [['slotstatus0', 1]], longs: [['creator', 77n]],
      strings: [['slot0', 'Bread']],
    },
    {
      prefab: 'piece_beehive', x: 62, z: 76,
      floats: [['product', 6.5]], ints: [['level', 3]], longs: [['creator', 77n]],
    },
    {
      prefab: 'windmill', x: 63, z: 77,
      ints: [['spawnAmount', 12]], longs: [['creator', 77n]], strings: [['spawnOre', 'BarleyFlour']],
    },
  ], []), prefabs)

  assert.equal(database.baseOperations.portals.length, 1)
  assert.equal(database.baseOperations.portals[0].tag, 'Home')
  assert.equal(database.baseOperations.portals[0].connectionType, 1)
  assert.equal(database.baseOperations.portals[0].connectionHash, 1234)
  assert.equal(database.baseOperations.portals[0].yaw, 90)
  assert.equal(database.baseOperations.stations.length, 5)
  assert.equal(database.baseOperations.stations[0].queued, 5)
  assert.equal(database.baseOperations.stations[0].fuel, 0)
  assert.deepEqual(database.baseOperations.stations[0].queueItems, ['CopperOre'])
  assert.deepEqual(database.baseOperations.stations[0].slotStatuses, [])
  assert.equal(database.baseOperations.stations[1].content, 'BarleyWineBase')
  assert.equal(database.baseOperations.stations[1].startTimeTicks, 123_000_000)
  assert.deepEqual(database.baseOperations.stations[2].queueItems, ['Bread'])
  assert.deepEqual(database.baseOperations.stations[2].slotStatuses, [1])
  assert.deepEqual(database.baseOperations.stations[2].slotCookTimes, [42])
  assert.equal(database.baseOperations.stations[3].productProgress, 6.5)
  assert.equal(database.baseOperations.stations[3].level, 3)
  assert.equal(database.baseOperations.stations[4].processedOutputPrefab, 'BarleyFlour')
  assert.equal(database.baseOperations.stations[4].processedOutputAmount, 12)
})

const parsedState = (): SaveResourceState =>
  parseWorldDatabase(buildFixtureDatabase(fixtureZdos, fixtureZones), fixturePrefabs).resourceState

test('loot states follow Pickable respawn rules', () => {
  const index = buildResourceStateIndex(parsedState(), catalogNodes, itemNodes)
  const berries = index.nodesForItem('Raspberry')
  assert.equal(berries.length, 3)

  const untouched = berries.find((point) => point.x === 10)
  assert.equal(untouched?.status, 'present')

  const respawning = berries.find((point) => point.x === 100)
  assert.equal(respawning?.status, 'respawning')
  assert.ok(respawning?.respawnRemainingGameMinutes !== null)
  assert.ok(Math.abs((respawning?.respawnRemainingGameMinutes ?? 0) - 200) < 0.001)

  const respawned = berries.find((point) => point.x === -50)
  assert.equal(respawned?.status, 'present')
})

test('non-respawning picks and mined rocks resolve their own states', () => {
  const index = buildResourceStateIndex(parsedState(), catalogNodes, itemNodes)
  // picked with no picked_time yet: freshly picked, full timer for respawners,
  // depleted for one-shot pickables
  assert.equal(index.nodesForItem('Flint')[0]?.status, 'depleted')
  // a damaged tree still stands
  assert.equal(index.nodesForItem('Wood')[0]?.status, 'present')
  // a damaged deposit still holds ore
  assert.equal(index.nodesForItem('CopperOre')[0]?.status, 'partial')
})

test('map material options count only collectable nodes and point to their save positions', () => {
  const index = buildResourceStateIndex(parsedState(), catalogNodes, itemNodes)
  const counts = Object.fromEntries(index.availableMaterials().map((entry) => [entry.itemPrefab, entry.count]))
  assert.equal(counts.raspberry, 2)
  assert.equal(counts.flint, undefined)
  assert.equal(counts.wood, 1)
  assert.equal(counts.copperore, 1)
  assert.deepEqual(index.nodesForItem('RASPBERRY').map((point) => [point.x, point.status]), [
    [10, 'present'],
    [100, 'respawning'],
    [-50, 'present'],
  ])
  assert.deepEqual(index.nodesForItem('missing'), [])
})

test('selecting multiple materials does not duplicate shared resource nodes', () => {
  const index = buildResourceStateIndex(parsedState(), catalogNodes, {
    ...itemNodes,
    berryfiber: ['RaspberryBush'],
  })
  const points = index.pointsForMaterials(['raspberry', 'berryfiber', 'CopperOre'])
  assert.deepEqual(points.map((point) => [point.nodePrefab, point.x, point.status]), [
    ['RaspberryBush', 10, 'present'],
    ['RaspberryBush', -50, 'present'],
    ['rock4_copper_frac', 400, 'partial'],
  ])
})

test('nearest lookup skips non-collectable nodes', () => {
  const index = buildResourceStateIndex(parsedState(), catalogNodes, itemNodes)
  // From (90, 190) the picked bush at (100, 200) is nearest, but it is
  // respawning; the collectable answer is the untouched bush at (10, 20).
  const nearest = index.nearestForItem('Raspberry', 90, 190)
  assert.equal(nearest?.point.x, 10)
  const respawning = index.nearestRespawningForItem('Raspberry', 90, 190)
  assert.equal(respawning?.point.x, 100)
  assert.equal(index.nearestForItem('Iron', 0, 0), null)
  assert.equal(index.hasNodesForItem('Raspberry'), true)
  assert.equal(index.hasNodesForItem('Iron'), false)
})

test('zone generation math matches ZoneSystem.GetZone', () => {
  assert.equal(worldToZone(0), 0)
  assert.equal(worldToZone(31.9), 0)
  assert.equal(worldToZone(32), 1)
  assert.equal(worldToZone(-32.1), -1)

  const index = buildResourceStateIndex(parsedState(), catalogNodes, itemNodes)
  assert.equal(index.zoneGenerated(10, 20), true)
  assert.equal(index.zoneGenerated(5 * 64, -3 * 64), true)
  assert.equal(index.zoneGenerated(400, 0), false)
})

test('material hints prefer save-confirmed spots and degrade honestly', async () => {
  const { resolveMaterialHint, compassDirection } = await import(
    '../../src/features/crafting-planner/resource-hints.ts'
  )
  const index = buildResourceStateIndex(parsedState(), catalogNodes, itemNodes)
  const origin = { x: 0, z: 0 }

  const confirmed = resolveMaterialHint('Raspberry', [], index, origin)
  assert.equal(confirmed.kind, 'confirmed')

  // Flint has nodes in the catalog but its only instance is picked for good,
  // and it does not respawn: no confirmed spot, no respawn timer.
  const locationSource = {
    id: 'location:pickable:Crypt2',
    kind: 'locationPickable' as const,
    certainty: 'possible' as const,
    name: 'Crypt2',
    prefabName: 'Crypt2',
  }
  const fallback = resolveMaterialHint('Flint', [locationSource], index, origin)
  assert.equal(fallback.kind, 'location')

  const craftSource = {
    id: 'Recipe_Bronze',
    kind: 'craft' as const,
    certainty: 'guaranteed' as const,
    name: 'Forge',
    prefabName: 'forge',
  }
  assert.equal(resolveMaterialHint('Bronze', [craftSource], null, origin).kind, 'craftOnly')
  assert.equal(resolveMaterialHint('MysteryItem', [], null, origin).kind, 'unknown')

  assert.equal(compassDirection(0, 10), 'n')
  assert.equal(compassDirection(10, 0), 'e')
  assert.equal(compassDirection(7, -7), 'se')
  assert.equal(compassDirection(-10, 0), 'w')
})

test('a truncated save fails loudly instead of returning bad data', () => {
  const full = new Uint8Array(buildFixtureDatabase(fixtureZdos, fixtureZones))
  const truncated = full.slice(0, Math.floor(full.length / 2)).buffer
  assert.throws(() => parseWorldDatabase(truncated, fixturePrefabs), /Unexpected end/)
})
