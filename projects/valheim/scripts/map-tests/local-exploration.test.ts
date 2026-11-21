import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gzipSync } from 'node:zlib'
import sharp from 'sharp'
import { matchingLocalExploration, parseLocalExploration } from '../../src/lib/live-tracking/local-exploration.ts'
import { isMapPointExplored } from '../../src/lib/valheim/explored-map.ts'
import { explorationMaskImage } from '../../src/lib/valheim/exploration-mask.ts'
import { exploredResourceIndex } from '../../src/lib/valheim/explored-resource-index.ts'
import type { ResourceNodePoint, ResourceStateIndex } from '../../src/lib/valheim/resource-state.ts'

const now = 1_000_000
const bits = Buffer.alloc(32)
bits[(10 * 16 + 9) >> 3] |= 1 << ((10 * 16 + 9) & 7) // x=12,z=24
const record = (extra = {}) => JSON.stringify({ payloadVersion: 1, isLocal: true, updatedAt: now,
  worldUid: '123', worldName: 'World', seedName: 'Seed', characterId: '42', characterName: 'A',
  textureSize: 16, pixelSize: 12, personalGzip: gzipSync(bits).toString('base64'), ...extra })
const identity = { uid: '123', name: 'World', seedName: 'Seed', characterId: '42', characterName: 'A', manualCharacter: false }

test('live packed personal exploration uses actual game scale and survives gzip transport', async () => {
  const snapshot = await parseLocalExploration(record(), now)
  assert.ok(snapshot)
  assert.ok(isMapPointExplored(snapshot.exploration, 12, 24))
  assert.equal(isMapPointExplored(snapshot.exploration, 0, 0), false)
  assert.equal(matchingLocalExploration(snapshot, identity, now), snapshot.exploration)
  const scaled = await parseLocalExploration(record({ pixelSize: 24 }), now)
  assert.ok(isMapPointExplored(scaled!.exploration, 24, 48))
})

test('remote, stale, malformed and over-inflated payloads fail closed', async () => {
  for (const extra of [{ isLocal: false }, { updatedAt: now - 10_001 }, { updatedAt: now + 5001 },
    { payloadVersion: 2 }, { textureSize: 4097 }, { textureSize: 0 }, { pixelSize: 0 },
    { worldUid: '' }, { characterId: 'unknown' }, { personalGzip: 'broken' },
    { personalGzip: gzipSync(Buffer.alloc(33)).toString('base64') },
    { personalGzip: gzipSync(Buffer.alloc(31)).toString('base64') }]) {
    assert.equal(await parseLocalExploration(record(extra), now), null, JSON.stringify(extra))
  }
  assert.equal(await parseLocalExploration('{', now), null)
  assert.equal(await parseLocalExploration(null, now), null)
})

test('live maps never cross worlds, character ids, duplicate names or manual character choices', async () => {
  const snapshot = await parseLocalExploration(record(), now)
  for (const change of [{ uid: '456' }, { name: 'Other' }, { seedName: 'Other' },
    { characterId: '43' }, { characterName: 'B' }, { manualCharacter: true, characterId: null }]) {
    assert.equal(matchingLocalExploration(snapshot, { ...identity, ...change }, now), null)
  }
  assert.equal(matchingLocalExploration(snapshot, identity, now + 10_001), null)
  assert.equal(matchingLocalExploration(snapshot, null, now), null)
})

test('terrain and geometry mask uses the same personal cell coordinates, including north orientation', async () => {
  const map = (await parseLocalExploration(record(), now))!.exploration
  const svg = decodeURIComponent(explorationMaskImage(map))
  // Cell (9,10) is centred on (12,24), so its top-left is (6,-30).
  assert.ok(svg.includes('<rect x="6" y="-30" width="12" height="12" rx="6"/>'))
  assert.equal((svg.match(/<rect /g) ?? []).length, 1)
})

test('rounded fog feathers inward without revealing unvisited cells or leaving seams between rows', async () => {
  const personal = new Uint8Array(32)
  const reveal = (x: number, z: number) => {
    const index = z * 16 + x
    personal[index >> 3] |= 1 << (index & 7)
  }
  for (let z = 8; z <= 11; z++) for (let x = 8; x <= 11; x++) if (x !== 11 || z !== 11) reveal(x, z)
  reveal(13, 8) // An isolated discovery must still have a visible centre.
  const map = { textureSize: 16, pixelSize: 12, bits: personal }
  const url = explorationMaskImage(map)
  const svg = decodeURIComponent(url.slice(url.indexOf(',') + 1, -2))
    .replace('viewBox="-10500 -10500 21000 21000"', 'width="240" height="240" viewBox="-24 -72 120 120"')
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const alphaAt = (x: number, z: number) => {
    const px = Math.floor((x + 24) * 2), py = Math.floor((-z + 72) * 2)
    return data[(py * info.width + px) * 4 + 3]
  }
  assert.ok(alphaAt(12, 12) > 250, 'The interior of explored terrain faded')
  assert.ok(alphaAt(6, 6) > 240, 'Adjacent rows developed a seam')
  assert.ok(alphaAt(-5, -5) < 10, 'The exposed square corner was not rounded inward')
  assert.ok(alphaAt(-3, 12) > 0 && alphaAt(-3, 12) < 200, 'The inner edge was not feathered')
  assert.ok(alphaAt(60, 0) > 0, 'An isolated discovered cell disappeared')
  for (let py = 0; py < info.height; py++) for (let px = 0; px < info.width; px++) {
    const x = -24 + (px + 0.5) / 2, z = 72 - (py + 0.5) / 2
    if (!isMapPointExplored(map, x, z)) assert.equal(data[(py * info.width + px) * 4 + 3], 0, `Unvisited terrain exposed at ${x},${z}`)
  }
})

test('resource search, counts, source routes and nearest navigation cannot expose hidden nodes', async () => {
  const map = (await parseLocalExploration(record(), now))!.exploration
  const points: ResourceNodePoint[] = [
    { x: 12, z: 24, nodePrefab: 'Ore', status: 'present', respawnRemainingGameMinutes: null },
    { x: 0, z: 0, nodePrefab: 'Ore', status: 'present', respawnRemainingGameMinutes: null },
  ]
  const source: ResourceStateIndex = {
    nodeCount: 2, worldTimeTicks: 0, zoneGenerated: () => true, nodesForItem: () => points,
    availableMaterials: () => [{ itemPrefab: 'Copper', count: 2 }], pointsForMaterials: () => points,
    nearestForItem: () => ({ point: points[1], distance: 0 }), nearestRespawningForItem: () => null, hasNodesForItem: () => true,
  }
  const restricted = exploredResourceIndex(source, map)!
  assert.deepEqual(restricted.nodesForItem('Copper'), [points[0]])
  assert.deepEqual(restricted.availableMaterials(), [{ itemPrefab: 'Copper', count: 1 }])
  assert.deepEqual(restricted.pointsForMaterials(['Copper']), [points[0]])
  assert.equal(restricted.nearestForItem('Copper', 0, 0)?.point, points[0])
  const missing = exploredResourceIndex(source, null)!
  assert.deepEqual(missing.availableMaterials(), [])
  assert.equal(missing.nearestForItem('Copper', 0, 0), null)
  assert.equal(missing.hasNodesForItem('Copper'), false)
  assert.equal(exploredResourceIndex(source, undefined), source)
})
