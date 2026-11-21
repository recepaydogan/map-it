import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MATERIAL_PROPERTIES,
  remainingHops,
  rgbToCss,
  supportBand,
  supportColor,
  supportColorValue,
} from '../../src/lib/building/support-model.ts'
import { bodiesTouch, solveSupport, type SimBody, type Vec3 } from '../../src/lib/building/support-solver.ts'
import { pieceFootprint, placedToSimBody, rotateXZ, type BuildingPiece } from '../../src/lib/building/building-catalog.ts'

type Material = SimBody['material']

/** Box by minimum corner and size. */
const box = (id: string, min: Vec3, size: Vec3, material: Material = 'Wood', kind: SimBody['kind'] = 'piece', supports = true): SimBody => ({
  id,
  min,
  max: { x: min.x + size.x, y: min.y + size.y, z: min.z + size.z },
  kind,
  material,
  supports,
})
/** 0.4 × h × 0.4 pole centred on (x, z), standing on `bottom`. */
const pole = (id: string, x: number, z: number, bottom: number, material: Material = 'Wood', height = 2) =>
  box(id, { x: x - 0.2, y: bottom, z: z - 0.2 }, { x: 0.4, y: height, z: 0.4 }, material)
/** Beam along X from `x0`, 0.4 × 0.4 section, centred on `z`, bottom at `bottom`. */
const beam = (id: string, x0: number, z: number, bottom: number, material: Material = 'Wood', length = 2) =>
  box(id, { x: x0, y: bottom, z: z - 0.2 }, { x: length, y: 0.4, z: 0.4 }, material)
const near = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`)

test('a piece touching the ground sits at the material maximum', () => {
  const solution = solveSupport([pole('a', 0, 0, 0)])
  assert.equal(solution.bodies.get('a')?.support, 100)
  assert.equal(solution.bodies.get('a')?.grounded, true)
  assert.equal(solution.collapsed.length, 0)
})

test('a stack of 2 m wood poles decays by (1 - 0.125 × 2.1) per pole and breaks at the 9th', () => {
  const poles = Array.from({ length: 10 }, (_, index) => pole(`p${index}`, 0, 0, index * 2))
  const solution = solveSupport(poles)
  const factor = 1 - 0.125 * 2.1
  near(solution.bodies.get('p1')!.support, 100 * factor)
  near(solution.bodies.get('p7')!.support, 100 * factor ** 7)
  // p8 = 100 × 0.7375^8 ≈ 8.75 < 10 → destroyed, taking p9 with it.
  assert.deepEqual(solution.collapsed, ['p8', 'p9'])
  assert.equal(solution.bodies.get('p8')?.collapses, true)
  assert.equal(solution.bodies.get('p7')?.collapses, false)
})

test('a horizontal beam run from a grounded pole decays at the horizontal rate', () => {
  const bodies: SimBody[] = [pole('post', 0, 0, 0), beam('b1', 0.2, 0, 1.6), beam('b2', 2.2, 0, 1.6), beam('b3', 4.2, 0, 1.6)]
  const solution = solveSupport(bodies)
  // Beam COM (1.2, 1.8, 0); pole COM (0, 1, 0) → distance ≈ 1.442 (+0.1). The
  // pole's closest point (0.2, 1.8, 0) is level with the COM → horizontal loss.
  const d1 = Math.hypot(1.2, 0.8) + 0.1
  near(solution.bodies.get('b1')!.support, 100 - 0.2 * d1 * 100)
  const b1 = solution.bodies.get('b1')!.support
  near(solution.bodies.get('b2')!.support, b1 - 0.2 * 2.1 * b1)
})

test('a beam held from both ends averages the two vertical-loss values (bridge rule)', () => {
  const bodies: SimBody[] = [pole('left', 0, 0, 0), pole('right', 4.4, 0, 0), beam('span', 0.2, 0, 2, 'Wood', 4)]
  const solution = solveSupport(bodies)
  const d = Math.hypot(2.2, 1.2) + 0.1
  const single = 100 - 0.125 * d * 100
  near(solution.bodies.get('span')!.support, single)
  const oneSided = solveSupport([pole('left', 0, 0, 0), beam('span', 0.2, 0, 2, 'Wood', 4)])
  assert.ok(oneSided.bodies.get('span')!.support < single)
})

test('the bridge rule works across the depth axis too (floor between two walls)', () => {
  // Two 2 m walls along X, 2 m apart in Z, a 2×2 floor between their tops.
  const wallA = box('wa', { x: -1, y: 0, z: -1.15 }, { x: 2, y: 2, z: 0.3 })
  const wallB = box('wb', { x: -1, y: 0, z: 0.85 }, { x: 2, y: 2, z: 0.3 })
  const floor = box('floor', { x: -1, y: 1.97, z: -1 }, { x: 2, y: 0.13, z: 2 })
  const both = solveSupport([wallA, wallB, floor]).bodies.get('floor')!.support
  const one = solveSupport([wallA, floor]).bodies.get('floor')!.support
  assert.ok(both > one)
  assert.ok(both > 60, `${both}`)
})

test('stone gets no horizontal support at all', () => {
  const wall = (id: string, x: number, bottom: number) => box(id, { x, y: bottom, z: -0.5 }, { x: 2, y: 1, z: 1 }, 'Stone')
  const solution = solveSupport([wall('base', 0, 0), wall('side', 2, 0.9)])
  assert.equal(solution.bodies.get('side')!.support, 0)
  assert.deepEqual(solution.collapsed, ['side'])
})

test('a rock (non-piece object) grants full support like terrain', () => {
  const rock = box('rock', { x: 0, y: 4, z: 0 }, { x: 2, y: 2, z: 2 }, 'Stone', 'static')
  const solution = solveSupport([rock, pole('p', 1, 1, 6)])
  assert.equal(solution.bodies.get('p')!.support, 100)
  assert.equal(solution.bodies.get('p')!.grounded, true)
})

test('pieces flagged supports=false pass nothing on', () => {
  const stand = box('stand', { x: -0.5, y: 0, z: -0.5 }, { x: 1, y: 1, z: 1 }, 'Wood', 'piece', false)
  const solution = solveSupport([stand, pole('p', 0, 0, 1)])
  assert.equal(solution.bodies.get('p')!.support, 0)
  assert.deepEqual(solution.collapsed, ['p'])
})

test('collapse cascades through everything the fallen piece carried', () => {
  const bodies: SimBody[] = [
    pole('post', 0, 0, 0),
    ...[0.2, 2.2, 4.2, 6.2, 8.2, 10.2].map((x, index) => beam(`b${index + 1}`, x, 0, 1.6)),
    pole('hanging', 11.2, 0, 2, 'Wood', 1),
  ]
  const solution = solveSupport(bodies)
  assert.ok(solution.collapsed.includes('b6'))
  assert.ok(solution.collapsed.includes('hanging'))
  assert.equal(solution.bodies.get('b1')!.collapses, false)
})

test('a weaker material borrows a stronger neighbour and clamps to its own maximum', () => {
  const ironColumn = Array.from({ length: 4 }, (_, index) => pole(`i${index}`, 0, 0, index * 2, 'Iron'))
  const woodBeam = beam('wood', 0.15, 0, 7.6)
  const solution = solveSupport([...ironColumn, woodBeam])
  assert.equal(solution.bodies.get('wood')!.support, 100)
})

test('touch test honours the 0.15 m collider margin', () => {
  const a = pole('a', 0, 0, 0)
  assert.equal(bodiesTouch(a, pole('b', 0, 0, 2.1)), true)
  assert.equal(bodiesTouch(a, pole('c', 0, 0, 2.2)), false)
  assert.equal(bodiesTouch(a, pole('d', 0.5, 0, 0)), true)
  assert.equal(bodiesTouch(a, pole('e', 0.6, 0, 0)), false)
})

test('footprints rotate about Y in quarter turns and keep the origin shortcut', () => {
  const wall: BuildingPiece = {
    prefabName: 'Piece_grausten_wall_2x2', name: 'Grausten Wall 2x2', icon: null, category: 3, enabled: true,
    material: 'Ashstone', health: 2000, supports: true, noRoofWear: false, noSupportWear: true,
    ashDamageImmune: false, ashDamageResist: true, burnable: false, forceCorrectCom: false,
    comfort: 0, comfortGroup: 'None', station: null, resources: [],
    comOffset: [0, 1, 0], bounds: { min: [-1, 0, -0.2], max: [1, 2, 0.2] }, boxy: true,
    snapPoints: [[-1, 2, 0], [1, 2, 0], [-1, 0, 0], [1, 0, 0]],
  }
  const flat = pieceFootprint(wall, 0)!
  const turned = pieceFootprint(wall, 1)!
  assert.deepEqual(flat.size, { x: 2, y: 2, z: 0.4 })
  assert.deepEqual(turned.size, { x: 0.4, y: 2, z: 2 })
  assert.deepEqual(rotateXZ(1, 0, 1), { x: 0, z: -1 })
  const catalog = { materials: MATERIAL_PROPERTIES, pieces: new Map([[wall.prefabName, wall]]) }
  const body = placedToSimBody({ id: 'w', prefabName: wall.prefabName, x: 5, y: 0, z: 5, yaw: 1 }, catalog)!
  assert.deepEqual(body.min, { x: 4.8, y: 0, z: 4 })
  assert.deepEqual(body.max, { x: 5.2, y: 2, z: 6 })
  // Origin sits at the bottom centre: 1 m below the box centre.
  assert.deepEqual(body.originOffset, { x: 0, y: -1, z: 0 })
  assert.deepEqual(body.comOffset, { x: 0, y: 0, z: 0 })
})

test('colour ramp matches WearNTear.Highlight', () => {
  assert.equal(supportColorValue(100, 'Wood'), -1)
  assert.equal(supportColorValue(50, 'Wood'), 1)
  assert.equal(supportColorValue(10, 'Wood'), 0)
  assert.equal(rgbToCss(supportColor(100, 'Wood')), 'rgb(153, 204, 255)')
  assert.equal(rgbToCss(supportColor(10, 'Wood')), 'rgb(255, 0, 0)')
  assert.equal(rgbToCss(supportColor(50, 'Wood')), 'rgb(115, 230, 115)')
  assert.equal(supportBand(100, 'Wood'), 'grounded')
  assert.equal(supportBand(60, 'Wood'), 'strong')
  assert.equal(supportBand(9, 'Wood'), 'collapsing')
})

test('remaining hops mirror the reach table', () => {
  assert.equal(remainingHops(MATERIAL_PROPERTIES.Wood.maxSupport, 'Wood', 2, 'vertical'), 7)
  assert.equal(remainingHops(MATERIAL_PROPERTIES.Wood.maxSupport, 'Wood', 2, 'horizontal'), 4)
  assert.equal(remainingHops(MATERIAL_PROPERTIES.HardWood.maxSupport, 'HardWood', 2, 'vertical'), 11)
  assert.equal(remainingHops(MATERIAL_PROPERTIES.Iron.maxSupport, 'Iron', 2, 'vertical'), 24)
  assert.equal(remainingHops(MATERIAL_PROPERTIES.Stone.maxSupport, 'Stone', 2, 'horizontal'), 0)
})
