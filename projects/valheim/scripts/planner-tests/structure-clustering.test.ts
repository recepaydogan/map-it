import assert from 'node:assert/strict'
import test from 'node:test'
import { clusterPlayerStructures } from '../../src/lib/valheim/structure-clustering.ts'
import {
  STRUCTURE_KIND_FLOOR,
  STRUCTURE_KIND_WALL,
  STRUCTURE_MATERIAL_STONE,
  STRUCTURE_MATERIAL_WOOD,
  StructureGeometryBuilder,
} from '../../src/lib/valheim/structure-geometry.ts'
import { buildStructureMapPaths } from '../../src/lib/valheim/structure-map-paths.ts'

test('groups connected building pieces without a quadratic scan', () => {
  const structures = clusterPlayerStructures([
    { x: 0, z: 0 },
    { x: 8, z: 0 },
    { x: 16, z: 0 },
    { x: 80, z: 40 },
  ], 12)

  assert.deepEqual(structures.map(({ pieceCount }) => pieceCount), [3, 1])
  assert.deepEqual(structures[0], {
    id: '8.0:0.0:3',
    x: 8,
    z: 0,
    minX: 0,
    maxX: 16,
    minZ: 0,
    maxZ: 0,
    pieceCount: 3,
  })
})

test('keeps nearby but disconnected buildings separate', () => {
  const structures = clusterPlayerStructures([
    { x: -20, z: -20 },
    { x: -16, z: -20 },
    { x: 10, z: 10 },
    { x: 14, z: 10 },
  ], 12)

  assert.equal(structures.length, 2)
  assert.deepEqual(structures.map(({ pieceCount }) => pieceCount), [2, 2])
})

test('keeps real piece dimensions, yaw and materials for top-down rendering', () => {
  const builder = new StructureGeometryBuilder()
  builder.push({
    prefabName: 'wood_floor',
    material: 'Wood',
    bounds: { min: [-1, 0, -1], max: [1, 0.2, 1] },
    x: 10,
    z: 20,
    yaw: 0,
  })
  builder.push({
    prefabName: 'stone_wall_4x2',
    material: 'Stone',
    bounds: { min: [-2, -1, -0.5], max: [2, 1, 0.5] },
    x: 12,
    z: 20,
    yaw: 90,
  })

  const geometry = builder.build()
  assert.equal(geometry.count, 2)
  assert.deepEqual([...geometry.kind], [STRUCTURE_KIND_FLOOR, STRUCTURE_KIND_WALL])
  assert.deepEqual([...geometry.material], [STRUCTURE_MATERIAL_WOOD, STRUCTURE_MATERIAL_STONE])
  assert.deepEqual([...geometry.width], [2, 4])
  assert.deepEqual([...geometry.depth], [2, 1])
  assert.deepEqual([...geometry.yaw], [0, 90])

  const paths = buildStructureMapPaths(geometry)
  assert.equal(paths.filter(Boolean).length, 2)
  assert.match(paths[STRUCTURE_KIND_FLOOR * 6 + STRUCTURE_MATERIAL_WOOD], /M9,-19L11,-19L11,-21L9,-21Z/)
  assert.match(paths[STRUCTURE_KIND_WALL * 6 + STRUCTURE_MATERIAL_STONE], /M11\.5,-22L11\.5,-18L12\.5,-18L12\.5,-22Z/)
})
